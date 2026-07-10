"use client";
// Admin preview / fill of a campaign sheet. Renders the exact partner fill experience
// (grid + Shopify-like guided + live summary). With NO partner selected it is a pure,
// non-persisting preview. Pick a partner and the admin can fill & SUBMIT a real preorder
// on their behalf (same as a partner would).
import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Table2,
  LayoutGrid,
  Eye,
  Pencil,
  RotateCcw,
  Search,
  UserRound,
  UserPlus,
  X,
  Loader2,
  Send,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  TabBar,
  PreorderGridTab,
  PreorderGuidedTab,
  OrderSummaryPanel,
} from "@/app/preorder/preorder-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PreorderCampaign, PreorderTerms } from "@/types/preorder";
import type { MkPartner } from "@/types/documents";

type Mode = "grid" | "guided";

export default function PreviewClient({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<PreorderCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [terms, setTerms] = useState<PreorderTerms>({});
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("guided");

  const [partner, setPartner] = useState<MkPartner | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Deep-link from the overview ("Fill for customer") opens the picker immediately.
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("fill") === "1") {
      setPickerOpen(true);
    }
  }, []);
  const [busy, setBusy] = useState<null | "save" | "submit">(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/preorder/campaigns/${campaignId}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "Not found");
        setCampaign(data.campaign);
        setActiveTabId(data.campaign.tabs[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [campaignId]);

  // When a partner is chosen, load their existing preorder to prefill.
  useEffect(() => {
    if (!partner) return;
    fetch(`/api/admin/preorder/submissions?campaignId=${campaignId}&partnerMkId=${encodeURIComponent(partner.mkId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.submission) {
          const q: Record<string, number> = {};
          for (const l of data.submission.lines ?? []) q[l.rowId] = l.qty;
          setQuantities(q);
          setTerms(data.submission.terms ?? {});
        } else {
          const a = partner.address;
          const addr = a ? [a.street, [a.postNumber, a.city].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ") : "";
          setTerms({ invoiceAddress: addr, shippingAddress: addr, country: a?.country, phone: partner.phone, deliveryDate: null, comment: "" });
          setQuantities({});
        }
      })
      .catch(() => {});
  }, [partner, campaignId]);

  const setQty = useCallback((rowId: string, qty: number) => {
    setQuantities((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[rowId];
      else next[rowId] = qty;
      return next;
    });
  }, []);

  const activeTab = useMemo(() => campaign?.tabs.find((t) => t.id === activeTabId) ?? null, [campaign, activeTabId]);

  const submitFor = useCallback(
    async (action: "save" | "submit") => {
      if (!partner) return;
      setBusy(action);
      setError(null);
      try {
        const r = await fetch(`/api/admin/preorder/submissions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId,
            partnerMkId: partner.mkId,
            partnerName: partner.name,
            partnerEmail: partner.emails?.[0],
            quantities,
            terms,
            action,
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "Failed");
        setFlash(action === "submit" ? `Preorder submitted for ${partner.name}` : "Draft saved");
        setTimeout(() => setFlash(null), 3500);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        setBusy(null);
      }
    },
    [partner, campaignId, quantities, terms],
  );

  if (loading) {
    return (
      <div className="p-6 md:p-8 space-y-4">
        <div className="h-6 w-56 rounded skeleton" />
        <div className="h-96 rounded-xl skeleton" />
      </div>
    );
  }
  if (error && !campaign) {
    return (
      <div className="p-8">
        <Link href={`/preorder/${campaignId}`} className="text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to overview
        </Link>
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error}</div>
      </div>
    );
  }
  if (!campaign) return null;

  const currency = campaign.currency;

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-3 px-4 md:px-6 h-14">
          <Link href={`/preorder/${campaignId}`} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-foreground truncate leading-tight flex items-center gap-2">
              {campaign.title}
              <span className="inline-flex items-center gap-1 rounded-full bg-lime-600/10 text-lime-700 dark:text-lime-300 px-2 py-0.5 text-[10px] font-medium">
                <Eye className="w-3 h-3" /> {partner ? "Fill" : "Preview"}
              </span>
            </h1>
            <div className="text-[11px] text-muted-foreground">
              {partner ? `Filling for ${partner.name} — submits a real preorder` : "How partners fill this sheet — pick a partner to submit on their behalf"}
            </div>
          </div>
          <div className="flex-1" />
          {partner ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-600/10 text-lime-700 dark:text-lime-300 pl-2.5 pr-1 py-1 text-[12px] font-medium">
              <UserRound className="w-3.5 h-3.5" />
              <span className="max-w-[140px] truncate">{partner.name}</span>
              <button onClick={() => setPickerOpen(true)} className="p-0.5 rounded hover:bg-lime-600/20" title="Change customer"><Pencil className="w-3 h-3" /></button>
              <button onClick={() => { setPartner(null); setQuantities({}); setTerms({}); }} className="p-0.5 rounded hover:bg-lime-600/20" title="Clear"><X className="w-3 h-3" /></button>
            </span>
          ) : (
            <Button size="sm" className="h-8" onClick={() => setPickerOpen(true)}>
              <UserPlus className="w-3.5 h-3.5" /> Fill for customer
            </Button>
          )}
          {Object.keys(quantities).length > 0 && (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setQuantities({})}>
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </Button>
          )}
          <Link href={`/preorder/${campaignId}/edit`}>
            <Button variant="outline" size="sm" className="h-8"><Pencil className="w-3.5 h-3.5" /> Edit sheet</Button>
          </Link>
          <div className="hidden sm:flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            <button onClick={() => setMode("grid")} className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-[12px]", mode === "grid" ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
              <Table2 className="w-3.5 h-3.5" /> Grid
            </button>
            <button onClick={() => setMode("guided")} className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-[12px]", mode === "guided" ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
              <LayoutGrid className="w-3.5 h-3.5" /> Store
            </button>
          </div>
        </div>
        <div className="px-4 md:px-6 pb-2">
          <TabBar tabs={campaign.tabs} activeId={activeTabId} onSelect={setActiveTabId} quantities={quantities} />
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="min-w-0">
            {!activeTab ? (
              <div className="text-center text-[13px] text-muted-foreground py-16">This sheet has no tabs yet.</div>
            ) : mode === "grid" ? (
              <PreorderGridTab tab={activeTab} quantities={quantities} onQty={setQty} currency={currency} />
            ) : (
              <PreorderGuidedTab tab={activeTab} quantities={quantities} onQty={setQty} currency={currency} />
            )}
          </div>

          <aside className="lg:sticky lg:top-4 space-y-3">
            <OrderSummaryPanel campaign={campaign} quantities={quantities} currency={currency} />

            {partner ? (
              <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
                <div className="flex items-center gap-2 pb-1">
                  <span className="w-8 h-8 rounded-full bg-lime-600/10 flex items-center justify-center shrink-0">
                    <UserRound className="w-4 h-4 text-lime-600" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-foreground truncate">{partner.name}</div>
                    {partner.emails?.[0] && <div className="text-[11px] text-muted-foreground truncate">{partner.emails[0]}</div>}
                  </div>
                </div>
                <Button className="w-full" onClick={() => submitFor("submit")} disabled={busy !== null}>
                  {busy === "submit" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Submit preorder
                </Button>
                <Button variant="outline" className="w-full" onClick={() => submitFor("save")} disabled={busy !== null}>
                  {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save draft
                </Button>
                {flash && <p className="text-[12px] text-lime-600 dark:text-lime-400 text-center pt-1">{flash}</p>}
                {error && <p className="text-[12px] text-destructive text-center pt-1">{error}</p>}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface p-3 text-center space-y-2">
                <p className="text-[12px] text-muted-foreground">This is a preview. To place a preorder, choose a customer.</p>
                <Button size="sm" className="w-full" onClick={() => setPickerOpen(true)}>
                  <UserPlus className="w-3.5 h-3.5" /> Fill for customer
                </Button>
              </div>
            )}

            {partner && (
              <details className="rounded-xl border border-border bg-surface p-3">
                <summary className="text-[12px] font-medium text-foreground cursor-pointer">Partner details</summary>
                <dl className="mt-3 space-y-2">
                  <ViewRow label="Invoice address" value={terms.invoiceAddress} />
                  <ViewRow label="Shipping address" value={terms.shippingAddress} />
                  <ViewRow label="Country" value={terms.country} />
                  <ViewRow label="Phone" value={terms.phone} />
                </dl>
                <p className="text-[10px] text-muted-foreground mt-2">From the partner&rsquo;s Metakocka record.</p>
              </details>
            )}
          </aside>
        </div>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-lime-600" /> Fill for customer
            </DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-muted-foreground -mt-1">
            Choose the partner you&rsquo;re placing this preorder for. Their existing draft (if any) will load.
          </p>
          <PartnerPicker
            onSelect={(p) => {
              setPartner(p);
              setPickerOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ViewRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12px]">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-foreground text-right break-words min-w-0">{value || "—"}</dd>
    </div>
  );
}

function PartnerPicker({ onSelect }: { onSelect: (p: MkPartner) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MkPartner[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/preorder/partners?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((data) => !cancelled && setResults(data.partners ?? []))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input autoFocus placeholder="Search partner…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 h-8 text-[12px]" />
      </div>
      <div className="max-h-56 overflow-y-auto mt-2 -mx-1">
        {loading && <div className="text-[11px] text-muted-foreground px-2 py-2">Searching…</div>}
        {!loading && results.length === 0 && <div className="text-[11px] text-muted-foreground px-2 py-2">No partners found.</div>}
        {results.map((p) => (
          <button
            key={p.mkId}
            onClick={() => onSelect(p)}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50"
          >
            <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
              <UserRound className="w-3.5 h-3.5 text-muted-foreground" />
            </span>
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-foreground truncate">{p.name}</div>
              {p.emails?.[0] && <div className="text-[10px] text-muted-foreground truncate">{p.emails[0]}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
