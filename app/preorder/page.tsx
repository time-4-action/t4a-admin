"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  ShoppingCart,
  ChevronRight,
  Plus,
  Loader2,
  Pencil,
  ClipboardList,
  Trash2,
  AlertTriangle,
  Eye,
  Link2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonLine, stagger } from "@/components/ui/skeleton";
import {
  CAMPAIGN_STATUS_LABELS,
  type PreorderCampaignSummary,
  type CampaignStatus,
} from "@/types/preorder";

const STATUS_STYLE: Record<CampaignStatus, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  open: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300",
  closed: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
};

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

export default function PreorderCampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<PreorderCampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSeason, setNewSeason] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PreorderCampaignSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch the campaign's magic invite link (token ensured server-side) and copy it.
  async function copyInvite(id: string) {
    try {
      const r = await fetch(`/api/admin/preorder/campaigns/${id}/invite`);
      const d = await r.json();
      if (d?.path) {
        await navigator.clipboard.writeText(`${window.location.origin}${d.path}`);
        setCopiedId(id);
        setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1800);
      }
    } catch {
      /* clipboard blocked / fetch failed — ignore */
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/preorder/campaigns")
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setError(data?.error ?? "Couldn't load campaigns");
          return;
        }
        setCampaigns(data.campaigns ?? []);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Error"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.season ?? "").toLowerCase().includes(q),
    );
  }, [campaigns, search]);

  async function createCampaign() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/preorder/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), season: newSeason.trim() }),
      });
      const data = await r.json();
      if (r.ok && data.campaign?.id) {
        router.push(`/preorder/${data.campaign.id}/edit`);
      } else {
        setError(data?.error ?? "Couldn't create campaign");
        setSaving(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  }

  async function deleteCampaign() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/admin/preorder/campaigns/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (r.ok) {
        setCampaigns((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        const data = await r.json().catch(() => ({}));
        setError(data?.error ?? "Couldn't delete campaign");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground shrink-0">
              Preorder Campaigns
            </h1>
            {loading ? (
              <Skeleton className="h-5 w-8 rounded-full shrink-0" />
            ) : (
              <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0 tabular-nums">
                {filtered.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden />
              <Input
                placeholder="Search campaigns…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search campaigns"
                className="pl-8 h-8 w-36 md:w-52 text-xs bg-background"
              />
            </div>
            <Button size="sm" onClick={() => setCreating(true)} className="h-8">
              <Plus className="w-3.5 h-3.5" /> New campaign
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 p-4 md:p-8 flex flex-col">
        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12px] text-destructive">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0 bg-surface border border-border rounded-xl overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-surface">
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9 pl-5">Campaign</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Status</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Deadline</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Sheet</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground h-9">Preorders</TableHead>
                <TableHead className="h-9 w-[184px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="border-b border-border/60">
                    <TableCell className="pl-5 py-3">
                      {/* leading-tight: 13px → 16.25px, 11px → 13.75px */}
                      <SkeletonLine lh="h-4" h="h-3.5" w="w-40" delay={stagger(i)} />
                      <SkeletonLine lh="h-[14px]" h="h-2.5" w="w-20" delay={stagger(i, 80, 20)} />
                    </TableCell>
                    <TableCell><Skeleton className="h-[20.5px] w-16 rounded-full" delay={stagger(i, 80, 40)} /></TableCell>
                    <TableCell><SkeletonLine lh="h-[18px]" w="w-20" delay={stagger(i, 80, 60)} /></TableCell>
                    <TableCell><SkeletonLine lh="h-[18px]" w="w-24" delay={stagger(i, 80, 80)} /></TableCell>
                    <TableCell><SkeletonLine lh="h-[18px]" w="w-6" delay={stagger(i, 80, 100)} /></TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center justify-end gap-1">
                        {[0, 1, 2, 3, 4].map((j) => (
                          <Skeleton key={j} className="w-[26px] h-[26px] rounded-md" delay={stagger(i, 80, 120 + j * 20)} />
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

              {!loading &&
                filtered.map((c) => {
                  const overviewHref = `/preorder/${c.id}`;
                  return (
                    <TableRow key={c.id} className="border-b border-border/60 hover:bg-muted/30 transition-colors group">
                      <TableCell className="pl-5 py-3">
                        <Link href={overviewHref} className="min-w-0 focus-visible:outline-none block">
                          <div className="text-[13px] font-medium text-foreground group-hover:underline truncate leading-tight">
                            {c.title}
                          </div>
                          {c.season && (
                            <span className="text-[11px] text-muted-foreground block truncate leading-tight">
                              {c.season}
                            </span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[c.status])}>
                          {CAMPAIGN_STATUS_LABELS[c.status]}
                        </span>
                      </TableCell>
                      <TableCell className="text-[12px] text-muted-foreground whitespace-nowrap">
                        {fmtDate(c.deadline)}
                      </TableCell>
                      <TableCell className="text-[12px] text-foreground whitespace-nowrap tabular-nums">
                        {c.tabCount} tab{c.tabCount === 1 ? "" : "s"}
                        <span className="text-muted-foreground"> · {c.rowCount} rows</span>
                      </TableCell>
                      <TableCell className="text-[12px] text-foreground tabular-nums">
                        {c.submissionCount}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => copyInvite(c.id)}
                            aria-label="Copy invite link"
                            title="Copy customer invite link"
                            className={cn(
                              "p-1.5 rounded-md hover:bg-muted transition-colors",
                              copiedId === c.id ? "text-lime-600" : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {copiedId === c.id ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                          </button>
                          <Link
                            href={`/preorder/${c.id}/preview`}
                            aria-label="Preview"
                            title="Preview as partner"
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Link>
                          <Link
                            href={`/preorder/${c.id}/edit`}
                            aria-label="Edit sheet"
                            title="Edit sheet"
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(c)}
                            aria-label="Delete campaign"
                            title="Delete campaign"
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <Link
                            href={overviewHref}
                            aria-label="Open"
                            title="Open"
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-[13px] text-muted-foreground py-16">
                    <ShoppingCart className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" aria-hidden />
                    {search.trim() ? "No campaigns match your search." : "No campaigns yet — create your first order sheet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={creating} onOpenChange={(o) => !saving && setCreating(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-lime-600" /> New preorder campaign
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <label className="text-[12px] font-medium text-foreground">Title</label>
              <Input
                autoFocus
                placeholder="e.g. Ordersheet 2026"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="mt-1 h-9"
                onKeyDown={(e) => e.key === "Enter" && createCampaign()}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-foreground">Season / note <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input
                placeholder="e.g. Pre-order 2026"
                value={newSeason}
                onChange={(e) => setNewSeason(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreating(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={createCampaign} disabled={saving || !newTitle.trim()}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create &amp; build
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !deleting && !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" /> Delete campaign
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground py-1">
            Delete <strong className="text-foreground">{deleteTarget?.title}</strong>? This
            permanently removes the order sheet and{" "}
            <strong className="text-foreground">
              {deleteTarget?.submissionCount ?? 0} partner preorder
              {deleteTarget?.submissionCount === 1 ? "" : "s"}
            </strong>
            . This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={deleteCampaign} disabled={deleting}>
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
