import Link from "next/link";
import { getPartnerById } from "@/lib/metakocka";
import CustomerDocsClient from "./customer-docs-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ partnerMkId: string }> }) {
  const { partnerMkId: raw } = await params;
  const partnerMkId = decodeURIComponent(raw);
  const partner = await getPartnerById(partnerMkId);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-border bg-gradient-to-b from-muted/30 to-transparent">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6">
          <Link href="/documents" className="text-[12px] text-muted-foreground hover:text-foreground">
            ← All customers
          </Link>
          <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight mt-1">
            {partner?.name ?? partnerMkId}
          </h1>
          {partner && (
            <p className="text-[12px] text-muted-foreground mt-1">
              {[partner.emails[0], partner.taxId, partner.city].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-6">
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <CustomerDocsClient partnerMkId={partnerMkId} />
        </div>
      </div>
    </div>
  );
}
