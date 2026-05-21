import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { callWarranty } from "@/lib/warranty-api";
import { WarrantyStatusBadge } from "@/components/warranty-status-badge";
import type { WarrantySubmission } from "@/types/warranty";
import { WarrantyStatusEditor } from "./warranty-detail-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ submissionId: string }> };

function joinName(name: string, surname: string): string {
  return [name, surname].filter((x) => x?.trim()).join(" ").trim();
}

function fmtSubmittedLong(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(d);
}

function fmtDate(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(d);
}

const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|avif|heic|heif)$/i;
function isImage(url: string): boolean {
  return IMAGE_EXTS.test(url.split("?")[0] ?? "");
}

export default async function WarrantyDetailPage({ params }: PageProps) {
  const { submissionId } = await params;
  const result = await callWarranty(
    `/api/admin/submissions/${encodeURIComponent(submissionId)}`,
  );
  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <div className="p-8 text-[13px] text-destructive">
        Failed to load submission: {result.error}
      </div>
    );
  }
  const doc = result.data as WarrantySubmission;
  const fullName = joinName(doc.name, doc.surname);

  const personal: [string, string][] = [
    ["Full name", fullName],
    ["Company", doc.company],
    ["Type of partner", doc.typeOfPartner],
    ["Email", doc.email],
    ["Phone", doc.phone],
    ["Address", doc.address],
  ];

  const purchase: [string, string][] = [
    ["Invoice number", doc.invoiceNumber],
    ["Issued by", doc.invoiceIssuedBy],
    ["Date of purchase", fmtDate(doc.dateOfPurchase)],
    ["Country of purchase", doc.countryOfPurchase],
  ];

  const product: [string, string][] = [
    ["Product name", doc.productName],
    ["Product category", doc.productCategory],
    ["SKU", doc.sku],
    ["EAN", doc.ean],
    ["Serial number", doc.serialNumber],
    ["Date of failure", fmtDate(doc.dateOfFailure)],
    ["Approx. days of use", doc.daysOfUse],
  ];

  const uploads: [string, string][] = [
    ["Invoice / proof of purchase", doc.fileUrls.invoice],
    ["Serial number photo", doc.fileUrls.serial],
    ["Full product photo", doc.fileUrls.full],
    ["Closeup photo", doc.fileUrls.closeup],
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="h-12 border-b border-border/60 flex items-center px-4 md:px-6 shrink-0 bg-background/90 backdrop-blur-sm sticky top-0 z-20">
        <Link
          href="/warranty"
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          Submissions
        </Link>
        <span className="mx-2 text-border/60 select-none text-xs">/</span>
        <span className="text-[12px] font-medium text-foreground truncate font-mono">
          #{doc.submissionId.slice(0, 8)}
        </span>
      </header>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto min-w-0">
          {/* Hero */}
          <div className="relative px-4 md:px-8 pt-6 md:pt-8 pb-6 md:pb-7 border-b border-border/50 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-muted/40 via-transparent to-transparent pointer-events-none" />
            <div className="relative flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                  Warranty claim
                </p>
                <h1 className="text-xl font-bold text-foreground tracking-tight leading-tight truncate">
                  {fullName || doc.email || "Unnamed claim"}
                </h1>
                <p className="text-[13px] text-muted-foreground mt-1">
                  {doc.productName || "—"}{doc.serialNumber ? ` · ${doc.serialNumber}` : ""}
                </p>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Submitted {fmtSubmittedLong(doc.submittedAt)}
                </p>
              </div>
              <WarrantyStatusBadge status={doc.status} />
            </div>
          </div>

          {/* Sections */}
          <div className="px-4 md:px-8 py-6 md:py-8 space-y-8 max-w-3xl">
            <Section title="Personal details" rows={personal} />
            <Section title="Purchase details" rows={purchase} />
            <Section title="Product information" rows={product} />

            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Problem description
              </h2>
              <div className="rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
                <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
                  {doc.problemDescription?.trim() || "—"}
                </p>
              </div>
            </div>

            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Uploads
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {uploads.map(([label, url]) => (
                  <UploadCard key={label} label={label} url={url} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-full md:w-[310px] shrink-0 border-t md:border-t-0 md:border-l border-border/60 bg-muted/10 overflow-y-auto">
          <WarrantyStatusEditor
            submissionId={doc.submissionId}
            initialStatus={doc.status}
            statusUpdatedAt={doc.statusUpdatedAt ?? null}
            email={doc.email}
          />
        </aside>
      </div>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div>
      <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
        {title}
      </h2>
      <div className="rounded-2xl border border-border/60 bg-background overflow-hidden shadow-sm">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={
              "grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-x-4 px-4 py-3 " +
              (i === 0 ? "" : "border-t border-border/40")
            }
          >
            <span className="text-[12px] text-muted-foreground">{label}</span>
            <span className="text-[13px] text-foreground break-words">
              {value?.trim() ? value : <span className="text-muted-foreground">—</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function UploadCard({ label, url }: { label: string; url: string }) {
  if (!url) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground text-center">
        <p className="font-medium text-foreground/70 mb-1 truncate">{label}</p>
        <span>—</span>
      </div>
    );
  }
  const image = isImage(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl border border-border/60 bg-background overflow-hidden hover:border-foreground/30 transition-colors shadow-sm"
    >
      <div className="aspect-square bg-muted/40 flex items-center justify-center overflow-hidden">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <ExternalLink className="w-5 h-5" />
            <span className="text-[10px] uppercase tracking-wider">File</span>
          </div>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="text-[11px] font-medium text-foreground truncate">{label}</p>
        <p className="text-[10px] text-muted-foreground truncate group-hover:text-foreground transition-colors">
          {image ? "Click to enlarge" : "Open file"}
        </p>
      </div>
    </a>
  );
}
