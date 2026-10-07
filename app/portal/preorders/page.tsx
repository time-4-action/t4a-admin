import { redirect } from "next/navigation";
import { getPortalAccess, isAgentAccess, scopedPartner } from "@/lib/portal";
import { CustomerInfoStrip } from "@/app/documents/customer-header";
import { AccountsStrip } from "../accounts-strip";
import { PreordersList } from "./preorders-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same shell as the document lists (compact header, customer strip, full-width
// table card) so the portal reads as one product.
export default async function PortalPreordersPage() {
  const access = await getPortalAccess();
  if (!access.partner) redirect("/portal/no-account");
  const agent = isAgentAccess(access);
  const shown = agent ? await scopedPartner(access) : access.partner;
  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <h1 className="font-display text-lg font-medium tracking-tight text-foreground truncate">Preorders</h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto py-6">
        <div className="px-4 md:px-8 space-y-4">
          {agent && <AccountsStrip accounts={access.accounts} scope={access.scope} />}
          {shown && <CustomerInfoStrip customer={shown} />}
          <PreordersList scope={access.scope} multiAccount={agent} />
        </div>
      </div>
    </div>
  );
}
