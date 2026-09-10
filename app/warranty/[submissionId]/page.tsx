import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { DetailCrumbBar } from "@/components/detail-crumb-bar";
import { callWarranty } from "@/lib/warranty-api";
import { auth0 } from "@/lib/auth";
import { WarrantyStatusBadge } from "@/components/warranty-status-badge";
import type { WarrantySubmission } from "@/types/warranty";
import { ClaimDetailClient } from "./warranty-detail-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ submissionId: string }> };

function joinName(name: string, surname: string): string {
  return [name, surname].filter((x) => x?.trim()).join(" ").trim();
}

function fmtLong(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(d);
}

export default async function ClaimDetailPage({ params }: PageProps) {
  const { submissionId } = await params;
  const [result, session] = await Promise.all([
    callWarranty(
      `/api/admin/submissions/${encodeURIComponent(submissionId)}`,
    ),
    auth0.getSession(),
  ]);

  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <div className="p-8 text-[13px] text-destructive">
        Couldn&apos;t load this claim: {result.error}
      </div>
    );
  }

  const doc = result.data as WarrantySubmission;
  const fullName = joinName(doc.name, doc.surname);
  const publicUrl = `${process.env.WARRANTY_API_BASE?.replace(/\/$/, "") ?? ""}/warranty/${doc.submissionId}`;
  const adminLabel = session?.user?.name ?? session?.user?.email ?? "Admin";
  const adminPictureUrl = session?.user?.picture ?? undefined;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Sticky breadcrumb bar */}
      <DetailCrumbBar
        backHref="/warranty"
        backLabel="Claims"
        current={
          <span className="text-[12px] font-medium text-foreground truncate font-mono">
            #{doc.submissionId.slice(0, 8)}
          </span>
        }
        right={
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            title="Open the page the customer sees"
          >
            <ExternalLink className="w-3 h-3" />
            <span className="hidden sm:inline">Open customer view</span>
          </a>
        }
      />

      {/* Hero — name, product, current status */}
      <div className="relative px-4 md:px-8 pt-6 md:pt-8 pb-5 md:pb-6 border-b border-border/50 overflow-hidden shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-muted/40 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-display text-xl md:text-2xl font-medium text-foreground tracking-tight leading-none">
              {fullName || doc.email || "Unnamed claim"}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1 truncate">
              {doc.productName || "—"}
              {doc.serialNumber ? ` · ${doc.serialNumber}` : ""}
            </p>
            <p className="text-[11px] text-muted-foreground mt-2">
              Received {fmtLong(doc.submittedAt)}
            </p>
          </div>
          <WarrantyStatusBadge status={doc.status} rejected={doc.warrantyType === "denied"} />
        </div>
      </div>

      <ClaimDetailClient
        initialDoc={doc}
        publicUrl={publicUrl}
        adminLabel={adminLabel}
        adminPictureUrl={adminPictureUrl}
      />
    </div>
  );
}
