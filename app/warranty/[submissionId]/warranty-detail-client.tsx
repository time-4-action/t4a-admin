"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CUSTOMER_STATUSES,
  CUSTOMER_STATUS_LABELS,
  FACTORY_STATUSES,
  FACTORY_STATUS_LABELS,
  WARRANTY_STATUSES,
  WARRANTY_STATUS_LABELS,
  WARRANTY_SUGGESTIONS,
  WARRANTY_SUGGESTION_LABELS,
  WARRANTY_TYPES,
  WARRANTY_TYPE_LABELS,
  type Assignee,
  type ClaimNote,
  type CustomerStatus,
  type FactoryStatus,
  type WarrantyStatus,
  type WarrantySubmission,
  type WarrantySuggestion,
  type WarrantyType,
} from "@/types/warranty";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Check,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  Receipt,
  Send,
  Trash2,
  User,
  ExternalLink,
  Image as ImageIcon,
  CheckCircle2,
  Circle,
  ChevronsUpDown,
  Split,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWarrantyAssignees } from "../use-assignees";
import {
  AssigneePicker,
  AssigneeAvatar,
  adminPicture,
} from "../assignee-picker";
import { OptionPicker } from "../option-picker";

const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|avif|heic|heif)$/i;
const isImage = (url: string) => IMAGE_EXTS.test(url.split("?")[0] ?? "");

function fmtDateGB(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

function relativeFrom(now: number, value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const diff = now - d.getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

/**
 * Renders the absolute date during SSR + first paint, then swaps to the
 * relative form after mount. Avoids the hydration mismatch that comes from
 * Date.now() differing between server render and client hydration.
 */
function RelativeTime({ value }: { value: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const fallback = fmtDateGB(value);
  return (
    <span title={value} suppressHydrationWarning>
      {now == null ? fallback : relativeFrom(now, value)}
    </span>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

// ============================================================================

export function ClaimDetailClient({
  initialDoc,
  publicUrl,
  adminLabel,
}: {
  initialDoc: WarrantySubmission;
  publicUrl: string;
  adminLabel: string;
}) {
  const [doc, setDoc] = useState<WarrantySubmission>(initialDoc);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto space-y-6">
        <WorkflowCard
          submissionId={doc.submissionId}
          doc={doc}
          onUpdate={setDoc}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-6 min-w-0">
            <NotesCard
              submissionId={doc.submissionId}
              notes={doc.notes}
              adminLabel={adminLabel}
              onUpdate={setDoc}
            />

            <ProblemCard description={doc.problemDescription} />

            <UploadsCard fileUrls={doc.fileUrls} />
          </div>

          <aside className="space-y-4">
            <ContactCard doc={doc} publicUrl={publicUrl} />
            <PurchaseCard doc={doc} />
            <ProductCard doc={doc} />
          </aside>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Workflow card (pipeline + 5 dropdowns)
// ============================================================================

function WorkflowCard({
  submissionId,
  doc,
  onUpdate,
}: {
  submissionId: string;
  doc: WarrantySubmission;
  onUpdate: (next: WarrantySubmission) => void;
}) {
  const router = useRouter();
  const [savingField, setSavingField] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { admins, loading: assigneesLoading } = useWarrantyAssignees();
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [, startTransition] = useTransition();

  async function patch(field: string, body: Record<string, unknown>) {
    setSavingField(field);
    setError(null);
    const res = await fetch(
      `/api/warranty/submissions/${encodeURIComponent(submissionId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    setSavingField(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Couldn't save");
      return;
    }
    const updated = (await res.json()) as WarrantySubmission;
    onUpdate(updated);
    setSavedFlash(field);
    setTimeout(() => setSavedFlash((f) => (f === field ? null : f)), 1500);
    startTransition(() => router.refresh());
  }

  const updatePipeline = (body: {
    status?: WarrantyStatus;
    warrantyType?: WarrantyType | null;
  }) => patch("status", body);
  const setAssignee = (v: Assignee | "") =>
    patch("assignee", { assignee: v === "" ? null : v });
  const setWarrantyType = (v: WarrantyType | "") =>
    patch("warrantyType", { warrantyType: v === "" ? null : v });
  const setSuggestion = (v: WarrantySuggestion | "") =>
    patch("suggestion", { suggestion: v === "" ? null : v });
  const setFactoryStatus = (v: FactoryStatus | "") =>
    patch("factoryStatus", { factoryStatus: v === "" ? null : v });
  const setCustomerStatus = (v: CustomerStatus | "") =>
    patch("customerStatus", { customerStatus: v === "" ? null : v });

  return (
    <div className="bg-background rounded-2xl border border-border/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border/50 bg-muted/30 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-md bg-background border border-border/60 flex items-center justify-center">
            <Activity className="w-3 h-3 text-muted-foreground" />
          </div>
          <span className="text-[12px] font-semibold text-foreground">Workflow</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {savingField && (
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </span>
          )}
          {savedFlash && !savingField && (
            <span className="flex items-center gap-1 text-accent-brand">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
          {error && <span className="text-destructive">{error}</span>}
        </div>
      </div>

      <div className="p-5 space-y-5">
        <StatusPipeline
          current={doc.status}
          warrantyType={doc.warrantyType}
          saving={savingField === "status"}
          onChange={updatePipeline}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <WorkflowField label="Assigned to" saving={savingField === "assignee"}>
            <button
              type="button"
              onClick={() => setAssigneeOpen(true)}
              className="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-transparent px-2.5 text-[13px] transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {doc.assignee ? (
                <>
                  <AssigneeAvatar
                    name={doc.assignee}
                    picture={adminPicture(admins, doc.assignee)}
                    className="h-5 w-5 text-[10px]"
                  />
                  <span className="truncate">{doc.assignee}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Unassigned</span>
              )}
              <ChevronsUpDown
                className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </button>
            <AssigneePicker
              open={assigneeOpen}
              onOpenChange={setAssigneeOpen}
              admins={admins}
              loading={assigneesLoading}
              value={doc.assignee}
              onSelect={(name) => setAssignee(name ?? "")}
            />
          </WorkflowField>

          <WorkflowField label="Warranty type" saving={savingField === "warrantyType"}>
            <OptionPicker
              title="Warranty type"
              value={doc.warrantyType}
              options={WARRANTY_TYPES.map((t) => ({
                value: t,
                label: WARRANTY_TYPE_LABELS[t],
              }))}
              onSelect={(v) => setWarrantyType((v ?? "") as WarrantyType | "")}
            />
          </WorkflowField>

          <WorkflowField label="Suggestion" saving={savingField === "suggestion"}>
            <OptionPicker
              title="Suggestion"
              value={doc.suggestion}
              options={WARRANTY_SUGGESTIONS.map((s) => ({
                value: s,
                label: WARRANTY_SUGGESTION_LABELS[s],
              }))}
              onSelect={(v) =>
                setSuggestion((v ?? "") as WarrantySuggestion | "")
              }
            />
          </WorkflowField>

          <WorkflowField label="Factory" saving={savingField === "factoryStatus"}>
            <OptionPicker
              title="Factory status"
              value={doc.factoryStatus}
              options={FACTORY_STATUSES.map((s) => ({
                value: s,
                label: FACTORY_STATUS_LABELS[s],
              }))}
              onSelect={(v) =>
                setFactoryStatus((v ?? "") as FactoryStatus | "")
              }
            />
          </WorkflowField>

          <WorkflowField label="Customer" saving={savingField === "customerStatus"}>
            <OptionPicker
              title="Customer status"
              value={doc.customerStatus}
              options={CUSTOMER_STATUSES.map((s) => ({
                value: s,
                label: CUSTOMER_STATUS_LABELS[s],
              }))}
              onSelect={(v) =>
                setCustomerStatus((v ?? "") as CustomerStatus | "")
              }
            />
          </WorkflowField>
        </div>
      </div>
    </div>
  );
}

function WorkflowField({
  label,
  saving,
  children,
}: {
  label: string;
  saving: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
        {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      </div>
      {children}
    </div>
  );
}

// Flowchart geometry. A fixed node height lets the branch fork SVG line up its
// arrowheads with the two stacked rows on the right.
const NODE_H = 56; // px — matches the node box height
const ROW_GAP = 16; // px — gap between the two branch rows
const BRANCH_H = NODE_H * 2 + ROW_GAP; // total height of the branch column

function StatusPipeline({
  current,
  warrantyType,
  saving,
  onChange,
}: {
  current: WarrantyStatus;
  warrantyType: WarrantySubmission["warrantyType"];
  saving: boolean;
  onChange: (patch: { status?: WarrantyStatus; warrantyType?: WarrantyType | null }) => void;
}) {
  const denied = warrantyType === "denied";
  const idx = WARRANTY_STATUSES.indexOf(current);
  const decidedIdx = WARRANTY_STATUSES.indexOf("decided");
  const toSendIdx = WARRANTY_STATUSES.indexOf("to_send_new_product");
  const finishedIdx = WARRANTY_STATUSES.indexOf("finished");

  // Pipeline flow:
  //   Open → In review → Decided ─┬─→ To send new product → Finished
  //                                └─→ Rejected
  // Three linear stages, then a fork after "Decided": the approval path
  // (top, leading to Finished) and the denial path (bottom, terminal).

  function clickStage(s: WarrantyStatus) {
    // Leaving the denial path clears the rejection flag — either onto the
    // approval branch, or back to a stage before the decision (Open / In
    // review) — so the pipeline doesn't stay stuck on the rejection path.
    const targetIdx = WARRANTY_STATUSES.indexOf(s);
    if (denied && (s === "to_send_new_product" || targetIdx < decidedIdx)) {
      onChange({ status: s, warrantyType: null });
      return;
    }
    onChange({ status: s });
  }

  function clickRejected() {
    // Rejection logically follows the decision, so if the claim hasn't
    // reached "Decided" yet, fast-forward the status as well.
    if (idx < decidedIdx) {
      onChange({ status: "decided", warrantyType: "denied" });
    } else {
      onChange({ warrantyType: "denied" });
    }
  }

  function stageState(s: WarrantyStatus) {
    const i = WARRANTY_STATUSES.indexOf(s);
    // On the denial path, "To send new product" is a skipped stage rather
    // than a past/future one — it's not part of this claim's journey.
    if (s === "to_send_new_product" && denied) {
      return { past: false, active: false, skipped: true };
    }
    return { past: i < idx, active: i === idx, skipped: false };
  }

  const approvalLive = !denied && idx >= toSendIdx;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Pipeline · click a stage to move the claim
        </p>
        {denied && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
            Rejection path
          </span>
        )}
      </div>

      {/* Horizontal flowchart. Scrolls sideways on narrow screens rather than
          wrapping, so the branch geometry stays intact. */}
      <div className="overflow-x-auto pb-1 -mx-1 px-1">
        <div className="flex items-center w-max mx-auto" style={{ minHeight: BRANCH_H }}>
          <Node
            number={1}
            label={WARRANTY_STATUS_LABELS.open}
            state={stageState("open")}
            saving={saving}
            onClick={() => clickStage("open")}
          />
          <Arrow active={idx >= 1} />
          <Node
            number={2}
            label={WARRANTY_STATUS_LABELS.in_review}
            state={stageState("in_review")}
            saving={saving}
            onClick={() => clickStage("in_review")}
          />
          <Arrow active={idx >= 2} />
          <Gateway
            label={WARRANTY_STATUS_LABELS.decided}
            state={
              denied
                ? "rejected"
                : idx > decidedIdx
                ? "approved"
                : idx === decidedIdx
                ? "pending"
                : "future"
            }
          />

          <Fork topActive={approvalLive} bottomActive={denied} />

          <div className="flex flex-col" style={{ gap: ROW_GAP }}>
            {/* Approval path (top) */}
            <div className="flex items-center">
              <Node
                number={3}
                label={WARRANTY_STATUS_LABELS.to_send_new_product}
                state={stageState("to_send_new_product")}
                saving={saving}
                onClick={() => clickStage("to_send_new_product")}
              />
              <Arrow active={!denied && idx >= finishedIdx} />
              <Node
                number={4}
                label={WARRANTY_STATUS_LABELS.finished}
                state={stageState("finished")}
                saving={saving}
                onClick={() => clickStage("finished")}
              />
            </div>
            {/* Denial path (bottom) — terminal */}
            <div className="flex items-center">
              <Node
                label="Rejected"
                state={{ past: false, active: denied, skipped: false }}
                saving={saving}
                variant="rejected"
                onClick={clickRejected}
              />
            </div>
          </div>
        </div>
      </div>

      {denied && (
        <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
          This claim is on the rejection path. Click <strong className="text-foreground">To send new product</strong> above to move it back onto the approval branch.
        </p>
      )}
    </div>
  );
}

// A soft rounded arrowhead pointing right, ending at (x, y).
function arrowHead(x: number, y: number, s = 5) {
  return `M${x - s - 1},${y - s} Q${x - s + 1},${y - s + 1} ${x},${y} Q${x - s + 1},${y + s - 1} ${x - s - 1},${y + s}`;
}

const EDGE_W = 2.25;

// Horizontal connector between two aligned nodes — a soft, rounded edge with an
// arrowhead, sized to a node's height so it meets node centres.
function Arrow({ active, width = 38 }: { active: boolean; width?: number }) {
  const y = NODE_H / 2;
  const tip = width - 2;
  return (
    <svg
      width={width}
      height={NODE_H}
      className={cn("shrink-0", active ? "text-emerald-500" : "text-border/70")}
      aria-hidden
    >
      <path
        d={`M2,${y} L${tip - 4},${y}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={EDGE_W}
        strokeLinecap="round"
      />
      <path
        d={arrowHead(tip, y)}
        fill="none"
        stroke="currentColor"
        strokeWidth={EDGE_W}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// The branch after "Decided": a single point that splits into two smooth
// diverging curves — one easing up to the approval row, one down to the denial
// row — each ending in a rounded arrowhead. No square corners.
function Fork({ topActive, bottomActive }: { topActive: boolean; bottomActive: boolean }) {
  const w = 52;
  const tip = w - 2;
  const topY = NODE_H / 2; // centre of the top row
  const botY = NODE_H + ROW_GAP + NODE_H / 2; // centre of the bottom row
  const midY = BRANCH_H / 2;
  const cx = w * 0.55; // control-point x — pulls the curve into a gentle S
  const curve = (toY: number) =>
    `M2,${midY} C${cx},${midY} ${w * 0.42},${toY} ${tip - 4},${toY}`;
  return (
    <svg width={w} height={BRANCH_H} className="shrink-0 overflow-visible" aria-hidden>
      {/* top branch → approval */}
      <g className={topActive ? "text-emerald-500" : "text-border/70"}>
        <path d={curve(topY)} fill="none" stroke="currentColor" strokeWidth={EDGE_W} strokeLinecap="round" />
        <path d={arrowHead(tip, topY)} fill="none" stroke="currentColor" strokeWidth={EDGE_W} strokeLinejoin="round" strokeLinecap="round" />
      </g>
      {/* bottom branch → denial */}
      <g className={bottomActive ? "text-rose-500" : "text-border/70"}>
        <path d={curve(botY)} fill="none" stroke="currentColor" strokeWidth={EDGE_W} strokeLinecap="round" />
        <path d={arrowHead(tip, botY)} fill="none" stroke="currentColor" strokeWidth={EDGE_W} strokeLinejoin="round" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// BPMN-style decision gateway — a rounded diamond, NOT clickable. It marks the
// point where the claim must branch to an outcome (To send new product /
// Rejected). Its colour reflects whether the decision is pending or made.
function Gateway({
  label,
  state,
}: {
  label: string;
  state: "future" | "pending" | "approved" | "rejected";
}) {
  const diamond = {
    future: "border-border bg-background",
    pending:
      "border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500/60",
    approved:
      "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-600/50",
    rejected:
      "border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-600/50",
  }[state];
  const text = {
    future: "text-muted-foreground",
    pending: "text-amber-700 dark:text-amber-300",
    approved: "text-emerald-700 dark:text-emerald-300",
    rejected: "text-rose-700 dark:text-rose-300",
  }[state];
  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: 48, height: 48 }}
      title={`Decision (${label}) — the claim must go to an outcome below`}
    >
      {state === "pending" && (
        <span
          className="absolute h-8 w-8 rotate-45 rounded-md ring-2 ring-amber-400/40 animate-pulse"
          aria-hidden
        />
      )}
      <div
        className={cn(
          "absolute h-8 w-8 rotate-45 rounded-md border-2 shadow-sm transition-colors",
          diamond,
        )}
        aria-hidden
      />
      <Split
        className={cn("relative h-3.5 w-3.5 pointer-events-none", text)}
        style={{ transform: "rotate(90deg)" }}
      />
    </div>
  );
}

// A single flowchart node — a fixed-size box, centred label, clickable to move
// the claim to that stage.
function Node({
  number,
  label,
  state,
  saving,
  variant,
  onClick,
}: {
  number?: number;
  label: string;
  state: { past: boolean; active: boolean; skipped: boolean };
  saving: boolean;
  variant?: "rejected";
  onClick: () => void;
}) {
  const { past, active, skipped } = state;
  const Icon = past ? CheckCircle2 : Circle;
  const isRejected = variant === "rejected";
  return (
    <button
      type="button"
      onClick={() => !active && onClick()}
      disabled={saving || active}
      style={{ height: NODE_H }}
      className={cn(
        "group relative w-[124px] shrink-0 rounded-lg border px-2 flex flex-col items-center justify-center gap-1 text-center transition-all",
        active && isRejected
          ? "border-rose-600 bg-rose-600 text-white shadow-sm"
          : active
          ? "border-foreground bg-foreground text-background shadow-sm"
          : isRejected
          ? "border-rose-300 bg-rose-50/60 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/30 dark:border-rose-700/50 dark:text-rose-300"
          : skipped
          ? "border-dashed border-border bg-muted/20 text-muted-foreground/60 line-through"
          : past
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-700/50 dark:text-emerald-300"
          : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
        saving && "opacity-60 cursor-not-allowed",
      )}
      title={skipped ? "Skipped — the customer doesn't get a replacement" : undefined}
    >
      <div className="flex items-center gap-1 leading-none">
        <Icon
          className={cn(
            "w-3 h-3 shrink-0",
            active && isRejected && "text-white",
            active && !isRejected && "text-background",
            !active && past && "text-accent-brand",
            !active && isRejected && "text-destructive",
          )}
        />
        {number != null && (
          <span className="text-[9px] font-bold tabular-nums opacity-70">{number}</span>
        )}
        {isRejected && (
          <span className="text-[8px] font-bold uppercase tracking-wider opacity-70">alt</span>
        )}
      </div>
      <p
        className={cn(
          "text-[11px] font-semibold leading-tight",
          active && isRejected && "text-white",
          active && !isRejected && "text-background",
        )}
      >
        {label}
      </p>
    </button>
  );
}


// ============================================================================
// Notes timeline
// ============================================================================

function NotesCard({
  submissionId,
  notes,
  adminLabel,
  onUpdate,
}: {
  submissionId: string;
  notes: ClaimNote[];
  adminLabel: string;
  onUpdate: (next: WarrantySubmission) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function post() {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    setError(null);
    const res = await fetch(
      `/api/warranty/submissions/${encodeURIComponent(submissionId)}/notes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      },
    );
    setPosting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Couldn't post note");
      return;
    }
    const payload = (await res.json()) as { doc: WarrantySubmission };
    onUpdate(payload.doc);
    setDraft("");
    router.refresh();
  }

  async function remove(noteId: string) {
    setDeletingId(noteId);
    const res = await fetch(
      `/api/warranty/submissions/${encodeURIComponent(submissionId)}/notes/${encodeURIComponent(noteId)}`,
      { method: "DELETE" },
    );
    setDeletingId(null);
    if (!res.ok) return;
    const payload = (await res.json()) as { doc: WarrantySubmission };
    onUpdate(payload.doc);
    router.refresh();
  }

  return (
    <div className="bg-background rounded-2xl border border-border/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border/50 bg-muted/30 flex items-center gap-2.5">
        <div className="w-5 h-5 rounded-md bg-background border border-border/60 flex items-center justify-center">
          <MessageSquare className="w-3 h-3 text-muted-foreground" />
        </div>
        <span className="text-[12px] font-semibold text-foreground">Internal notes</span>
        {notes.length > 0 && (
          <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {notes.length}
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-bold shrink-0">
            {initials(adminLabel)}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  post();
                }
              }}
              placeholder="Add a note. Visible only to admins."
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-[13px] shadow-xs outline-none resize-y focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                Posting as <strong className="text-foreground">{adminLabel}</strong> · ⌘/Ctrl+Enter to post
              </p>
              {error && (
                <p className="text-[11px] text-destructive">{error}</p>
              )}
              <Button
                size="sm"
                className="h-7 text-xs px-3 gap-1.5"
                onClick={post}
                disabled={!draft.trim() || posting}
              >
                {posting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
                Post note
              </Button>
            </div>
          </div>
        </div>

        {notes.length === 0 ? (
          <p className="text-center text-[12px] text-muted-foreground py-6">
            No notes yet. Use this space for diagnostic notes, repair plans, and customer
            communication summaries.
          </p>
        ) : (
          <div className="space-y-3 pt-2 border-t border-border/40">
            {notes.map((n) => (
              <div key={n.id} className="flex gap-3 group">
                <div className="w-7 h-7 rounded-full bg-muted border border-border/60 flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                  {initials(n.authorName || "?")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold text-foreground">
                      {n.authorName || "Admin"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      <RelativeTime value={n.createdAt} />
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(n.id)}
                      disabled={deletingId === n.id}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground hover:text-destructive transition-all flex items-center gap-1 ml-auto"
                      title="Delete this note"
                    >
                      {deletingId === n.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                  <p className="text-[13px] text-foreground whitespace-pre-wrap break-words leading-relaxed mt-0.5">
                    {n.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Problem description + Uploads + Detail sidebars
// ============================================================================

function ProblemCard({ description }: { description: string }) {
  return (
    <div className="bg-background rounded-2xl border border-border/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border/50 bg-muted/30 flex items-center gap-2.5">
        <div className="w-5 h-5 rounded-md bg-background border border-border/60 flex items-center justify-center">
          <Receipt className="w-3 h-3 text-muted-foreground" />
        </div>
        <span className="text-[12px] font-semibold text-foreground">
          Problem as described by the customer
        </span>
      </div>
      <div className="p-5">
        <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
          {description?.trim() || "—"}
        </p>
      </div>
    </div>
  );
}

function UploadsCard({
  fileUrls,
}: {
  fileUrls: WarrantySubmission["fileUrls"];
}) {
  const uploads: [string, string][] = [
    ["Invoice / proof of purchase", fileUrls.invoice],
    ["Serial number photo", fileUrls.serial],
    ["Full product photo", fileUrls.full],
    ["Closeup photo", fileUrls.closeup],
  ];
  return (
    <div className="bg-background rounded-2xl border border-border/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border/50 bg-muted/30 flex items-center gap-2.5">
        <div className="w-5 h-5 rounded-md bg-background border border-border/60 flex items-center justify-center">
          <ImageIcon className="w-3 h-3 text-muted-foreground" />
        </div>
        <span className="text-[12px] font-semibold text-foreground">
          Customer uploads
        </span>
      </div>
      <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        {uploads.map(([label, url]) => (
          <UploadThumb key={label} label={label} url={url} />
        ))}
      </div>
    </div>
  );
}

function UploadThumb({ label, url }: { label: string; url: string }) {
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

function MiniCard({
  icon: Icon,
  title,
  rows,
  footer,
}: {
  icon: React.ElementType;
  title: string;
  rows: { label: string; value: React.ReactNode }[];
  footer?: React.ReactNode;
}) {
  return (
    <div className="bg-background rounded-2xl border border-border/60 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/50 bg-muted/30 flex items-center gap-2">
        <Icon className="w-3 h-3 text-muted-foreground" />
        <span className="text-[11px] font-semibold text-foreground">{title}</span>
      </div>
      <div className="p-4 space-y-2.5">
        {rows.map(({ label, value }) => (
          <div key={label} className="grid grid-cols-[110px_1fr] gap-3">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <span className="text-[12px] text-foreground break-words">
              {value || <span className="text-muted-foreground">—</span>}
            </span>
          </div>
        ))}
        {footer}
      </div>
    </div>
  );
}

function ContactCard({
  doc,
  publicUrl,
}: {
  doc: WarrantySubmission;
  publicUrl: string;
}) {
  const fullName = [doc.name, doc.surname].filter(Boolean).join(" ").trim();
  return (
    <MiniCard
      icon={User}
      title="Customer"
      rows={[
        { label: "Name", value: fullName },
        { label: "Company", value: doc.company },
        { label: "Type", value: doc.typeOfPartner },
        {
          label: "Email",
          value: doc.email ? (
            <a
              href={`mailto:${encodeURIComponent(doc.email)}?subject=${encodeURIComponent(`Re: warranty claim #${doc.submissionId.slice(0, 8)}`)}`}
              className="text-foreground hover:text-foreground hover:underline underline-offset-2 inline-flex items-center gap-1 break-all"
            >
              <Mail className="w-3 h-3 shrink-0" />
              {doc.email}
            </a>
          ) : (
            ""
          ),
        },
        { label: "Phone", value: doc.phone },
        {
          label: "Address",
          value: doc.address ? (
            <span className="inline-flex items-start gap-1">
              <MapPin className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground" />
              {doc.address}
            </span>
          ) : (
            ""
          ),
        },
      ]}
      footer={
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Customer-facing claim page
        </a>
      }
    />
  );
}

function PurchaseCard({ doc }: { doc: WarrantySubmission }) {
  return (
    <MiniCard
      icon={Receipt}
      title="Purchase"
      rows={[
        { label: "Invoice", value: doc.invoiceNumber },
        { label: "Issued by", value: doc.invoiceIssuedBy },
        { label: "Purchased", value: fmtDateGB(doc.dateOfPurchase) },
        { label: "Country", value: doc.countryOfPurchase },
      ]}
    />
  );
}

function ProductCard({ doc }: { doc: WarrantySubmission }) {
  return (
    <MiniCard
      icon={Package}
      title="Product"
      rows={[
        { label: "Product", value: doc.productName },
        { label: "Category", value: doc.productCategory },
        { label: "SKU", value: doc.sku ? <span className="font-mono">{doc.sku}</span> : "" },
        { label: "EAN", value: doc.ean ? <span className="font-mono">{doc.ean}</span> : "" },
        {
          label: "Serial",
          value: doc.serialNumber ? <span className="font-mono break-all">{doc.serialNumber}</span> : "",
        },
        { label: "Failed", value: fmtDateGB(doc.dateOfFailure) },
        { label: "Days used", value: doc.daysOfUse },
      ]}
    />
  );
}
