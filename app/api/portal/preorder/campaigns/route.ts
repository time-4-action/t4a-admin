import { NextResponse, type NextRequest } from "next/server";
import { getPortalAccess, isAgentAccess, scopedAccounts } from "@/lib/portal";
import {
  connectDB,
  PreorderCampaign,
  PreorderSubmission,
  PreorderAccess,
  toCampaignSummary,
  toObjectId,
} from "@/lib/preorder";
import type { IPreorderCampaign } from "@/models/preorder-campaign";
import { submissionStage, totalsNet, type SubmissionStage, type SubmissionStatus } from "@/types/preorder";
import { ALL_ACCOUNTS, type PortalAccount } from "@/types/portal-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/portal/preorder/campaigns — the campaigns a logged-in partner has UNLOCKED
// (via a magic invite link → access grant) or already has a submission on, each
// annotated with their own submission status. Campaigns are NOT visible by default —
// this is the invite boundary. Partner from session only; an agent gets one row per
// (campaign, account) over the accounts of `?account=` (`all` or one of THEIR
// accounts; absent ⇒ the remembered scope), each row carrying its `account`.
export async function GET(req: NextRequest) {
  const access = await getPortalAccess();
  if (!access.partner) {
    return NextResponse.json({ error: "no-account", campaigns: [] }, { status: 404 });
  }
  const requested = req.nextUrl.searchParams.get("account");
  const scope = requested === ALL_ACCOUNTS || access.accounts.some((a) => a.mkId === requested) ? requested! : access.scope;
  const accounts = scopedAccounts({ accounts: access.accounts, scope });
  const annotate = isAgentAccess(access);
  const accountById = new Map<string, PortalAccount>(accounts.map((a) => [a.mkId, a]));
  const ids = accounts.map((a) => a.mkId);
  await connectDB();

  const [subs, grants] = await Promise.all([
    PreorderSubmission.find({ partnerMkId: { $in: ids } }).exec(),
    PreorderAccess.find({ partnerMkId: { $in: ids } }).exec(),
  ]);
  const key = (campaignId: unknown, partnerMkId: string) => `${String(campaignId)}|${partnerMkId}`;
  const subByKey = new Map(subs.map((s) => [key(s.campaignId, s.partnerMkId), s]));

  // Union of (campaign, account) pairs granted (unlocked) and already submitted to.
  const pairs = new Map<string, { campaignId: string; partnerMkId: string }>();
  for (const g of [...grants, ...subs]) {
    pairs.set(key(g.campaignId, g.partnerMkId), { campaignId: String(g.campaignId), partnerMkId: g.partnerMkId });
  }
  if (pairs.size === 0) return NextResponse.json({ campaigns: [] });

  const oids = Array.from(new Set(Array.from(pairs.values(), (p) => p.campaignId)))
    .map(toObjectId)
    .filter((o): o is NonNullable<typeof o> => !!o);
  const docs = (await PreorderCampaign.find({ _id: { $in: oids } })
    .sort({ deadline: 1, updatedAt: -1 })
    .exec()) as IPreorderCampaign[];

  // Never surface a draft campaign to the portal, even if a grant exists.
  const campaigns = docs
    .filter((d) => d.status !== "draft")
    .flatMap((d) =>
      accounts
        .filter((a) => pairs.has(key(d._id, a.mkId)))
        .map((a) => {
          const s = subByKey.get(key(d._id, a.mkId));
          // Customer-facing stage: never leaks MK identifiers, only whether the order
          // was registered / shown to them.
          const myStage: SubmissionStage | null = s
            ? submissionStage({
                status: s.status,
                mkOrder: s.mkOrder?.state ? { state: s.mkOrder.state, buyerOrder: "", attempts: 0 } : null,
                mkSalesOrder: s.mkSalesOrder?.mkId ? { mkId: s.mkSalesOrder.mkId, countCode: s.mkSalesOrder.countCode } : null,
                resultPublishedToCustomer: s.resultPublishedToCustomer,
              })
            : null;
          return {
            ...toCampaignSummary(d, 0),
            mySubmissionStatus: (s?.status ?? null) as SubmissionStatus | null,
            myStage,
            myItems: s?.totals?.qty ?? 0,
            myTotal: s ? totalsNet({ qty: s.totals?.qty ?? 0, amount: s.totals?.amount ?? 0, discount: s.totals?.discount ?? 0 }) : 0,
            mySubmittedAt: s?.submittedAt ? new Date(s.submittedAt).toISOString() : null,
            myUpdatedAt: s?.updatedAt ? new Date(s.updatedAt).toISOString() : null,
            ...(annotate ? { account: accountById.get(a.mkId)! } : {}),
          };
        }),
    );
  return NextResponse.json({ campaigns });
}
