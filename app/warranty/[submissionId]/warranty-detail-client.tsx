"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WarrantyStatusBadge } from "@/components/warranty-status-badge";
import {
  WARRANTY_STATUSES,
  WARRANTY_STATUS_LABELS,
  type WarrantyStatus,
} from "@/types/warranty";
import { Check, Loader2, Mail, ShieldCheck, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

function SidebarCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background rounded-2xl border border-border/60 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 bg-muted/30">
        <div className="w-5 h-5 rounded-md bg-background border border-border/60 flex items-center justify-center shadow-sm">
          <Icon className="w-3 h-3 text-muted-foreground" />
        </div>
        <span className="text-[11px] font-semibold text-foreground">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function WarrantyStatusEditor({
  submissionId,
  initialStatus,
  statusUpdatedAt,
  email,
}: {
  submissionId: string;
  initialStatus: WarrantyStatus;
  statusUpdatedAt: string | null;
  email: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<WarrantyStatus>(initialStatus);
  const [originalStatus, setOriginalStatus] = useState<WarrantyStatus>(initialStatus);
  const [lastUpdated, setLastUpdated] = useState<string | null>(statusUpdatedAt);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = status !== originalStatus;

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(
      `/api/warranty/submissions/${encodeURIComponent(submissionId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed to update status");
      return;
    }
    const data = await res.json();
    setOriginalStatus(status);
    setLastUpdated(data?.statusUpdatedAt ?? new Date().toISOString());
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    router.refresh();
  }

  return (
    <div className="p-4 space-y-3">
      <SidebarCard icon={Activity} title="Status">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Current</span>
            <WarrantyStatusBadge status={originalStatus} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Change to</label>
            <Select value={status} onValueChange={(v) => setStatus(v as WarrantyStatus)}>
              <SelectTrigger className="h-8 text-[13px] w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WARRANTY_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {WARRANTY_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          {lastUpdated && (
            <p className="text-[10px] text-muted-foreground">
              Last changed {new Date(lastUpdated).toLocaleString()}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              className={cn(
                "h-7 text-xs px-3 transition-all duration-200",
                saved && "bg-emerald-600 hover:bg-emerald-600 border-emerald-600",
              )}
              onClick={save}
              disabled={!dirty || saving || saved}
            >
              {saved ? (
                <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>
              ) : saving ? (
                <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</span>
              ) : "Save"}
            </Button>
          </div>
        </div>
      </SidebarCard>

      <SidebarCard icon={Mail} title="Contact">
        <div className="space-y-2">
          <a
            href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Re: warranty claim #${submissionId.slice(0, 8)}`)}`}
            className="block w-full text-[12px] text-foreground hover:text-foreground bg-muted/60 hover:bg-muted px-3 py-2 rounded-lg border border-border/60 transition-colors truncate"
          >
            {email}
          </a>
          <p className="text-[10px] text-muted-foreground">
            Opens your mail client. The customer receives no automated reply from this view.
          </p>
        </div>
      </SidebarCard>

      <SidebarCard icon={ShieldCheck} title="About this view">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Data is pulled live from the warranty service. Editing status updates Mongo; uploads
          link to the original S3 objects.
        </p>
      </SidebarCard>
    </div>
  );
}
