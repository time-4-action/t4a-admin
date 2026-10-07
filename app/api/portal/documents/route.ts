import { NextResponse, type NextRequest } from "next/server";
import { getPortalAccess, isAgentAccess, isPortalDocKind, scopedAccounts } from "@/lib/portal";
import { listDocuments } from "@/lib/metakocka";
import { filterCustomerVisible } from "@/lib/preorder-visibility";
import { parseDocKind, type DocSummary } from "@/types/documents";
import { ALL_ACCOUNTS } from "@/types/portal-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How many accounts' lists are pulled from Metakocka at once for an agent's
// "all accounts" view (each list is itself paged through to the end).
const ACCOUNT_CONCURRENCY = 4;

// List the logged-in customer's documents for one family. The partner is derived
// from the session email — any partner id in the request is ignored, except an
// agent's `account` choice (`all` or one of THEIR accounts, re-checked here; absent
// ⇒ the remembered scope). Sales orders created by an unpublished preorder are
// removed here, at the server layer (lib/preorder-visibility.ts); the total
// reflects what the customer may see.
export async function GET(req: NextRequest) {
  const kind = parseDocKind(req.nextUrl.searchParams.get("type"));
  if (!isPortalDocKind(kind)) return NextResponse.json({ error: "invalid type" }, { status: 400 });

  const access = await getPortalAccess();
  if (!access.partner) return NextResponse.json({ error: "no-account", items: [], total: 0 }, { status: 404 });

  const requested = req.nextUrl.searchParams.get("account");
  const scope = requested === ALL_ACCOUNTS || access.accounts.some((a) => a.mkId === requested) ? requested! : access.scope;
  const accounts = scopedAccounts({ accounts: access.accounts, scope });
  const annotate = isAgentAccess(access);

  const out: DocSummary[] = [];
  const failed: string[] = [];
  for (let i = 0; i < accounts.length; i += ACCOUNT_CONCURRENCY) {
    const batch = await Promise.all(
      accounts.slice(i, i + ACCOUNT_CONCURRENCY).map(async (account) => {
        try {
          const { items } = await listDocuments(kind, account.mkId);
          const visible = await filterCustomerVisible({ mkId: account.mkId }, items);
          return annotate ? visible.map((d) => ({ ...d, account })) : visible;
        } catch (err) {
          // One account's list failing must not blank an agent's combined view.
          if (accounts.length === 1) throw err;
          failed.push(account.name);
          return [];
        }
      }),
    );
    for (const items of batch) out.push(...items);
  }
  return NextResponse.json({ items: out, total: out.length, ...(failed.length ? { failed } : {}) });
}
