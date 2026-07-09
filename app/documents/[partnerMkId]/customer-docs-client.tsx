"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { DocumentList } from "@/app/documents/documents-shared";
import type { DocKind } from "@/types/documents";

const TABS: { kind: DocKind; label: string }[] = [
  { kind: "invoice", label: "Invoices" },
  { kind: "offer", label: "Offers" },
  { kind: "order", label: "Orders" },
];

export default function CustomerDocsClient({ partnerMkId }: { partnerMkId: string }) {
  const [tab, setTab] = useState<DocKind>("invoice");
  const listUrl = `/api/admin/documents?partner=${encodeURIComponent(partnerMkId)}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.kind}
            type="button"
            onClick={() => setTab(t.kind)}
            className={cn(
              "px-3 py-2 text-[13px] font-medium -mb-px border-b-2 transition-colors",
              tab === t.kind
                ? "border-teal-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <DocumentList
        kind={tab}
        listUrl={listUrl}
        hrefBase={`/documents/${encodeURIComponent(partnerMkId)}/${tab}`}
      />
    </div>
  );
}
