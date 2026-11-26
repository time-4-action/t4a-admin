import FillClient from "./fill-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ account?: string | string[]; submission?: string | string[]; new?: string | string[] }>;
}) {
  const { campaignId } = await params;
  // A portal agent filling for a client: `?account=<partnerMkId>` (re-checked by
  // every preorder route against the agent's accounts).
  // `?submission=<id>` / `?new=1` pick one of the customer's preorders when the
  // campaign allows several.
  const { account, submission, new: isNew } = await searchParams;
  const acc = typeof account === "string" ? account : "";
  const sub = typeof submission === "string" ? submission : "";
  const startNew = isNew === "1";
  return <FillClient key={`${campaignId}:${acc}:${sub}:${startNew ? "new" : ""}`} campaignId={campaignId} account={acc} initialSubmission={sub} startNew={startNew} />;
}
