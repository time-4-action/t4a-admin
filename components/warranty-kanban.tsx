"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  WARRANTY_STATUSES,
  WARRANTY_STATUS_LABELS,
  type WarrantyStatus,
  type WarrantySubmission,
} from "@/types/warranty";
import { STATUS_COLUMN_HEADER } from "@/components/warranty-status-badge";
import { User, Hash, Wrench, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_PER_COLUMN = 80;

function fmtDate(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
  }).format(d);
}

export function WarrantyKanban({
  items,
  onPersisted,
}: {
  items: WarrantySubmission[];
  onPersisted?: (updated: WarrantySubmission) => void;
}) {
  const router = useRouter();
  const [local, setLocal] = useState<WarrantySubmission[]>(items);
  const [dragging, setDragging] = useState<WarrantySubmission | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Sync local state when prop changes (filter / refetch).
  useEffect(() => {
    setLocal(items);
  }, [items]);

  const grouped = useMemo(() => {
    const m: Record<WarrantyStatus, WarrantySubmission[]> = {
      open: [],
      in_review: [],
      decided: [],
      to_send_new_product: [],
      finished: [],
    };
    for (const it of local) m[it.status]?.push(it);
    return m;
  }, [local]);

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setDragging(local.find((i) => i.submissionId === id) ?? null);
  }

  async function handleDragEnd(e: DragEndEvent) {
    setDragging(null);
    const { active, over } = e;
    if (!over) return;
    const id = String(active.id);
    const target = String(over.id) as WarrantyStatus;
    if (!(WARRANTY_STATUSES as string[]).includes(target)) return;

    const card = local.find((i) => i.submissionId === id);
    if (!card || card.status === target) return;

    // Optimistic
    setLocal((prev) =>
      prev.map((i) => (i.submissionId === id ? { ...i, status: target } : i)),
    );
    setSavingId(id);

    const res = await fetch(
      `/api/warranty/submissions/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      },
    );
    setSavingId(null);

    if (!res.ok) {
      // Rollback
      setLocal((prev) =>
        prev.map((i) =>
          i.submissionId === id ? { ...i, status: card.status } : i,
        ),
      );
      return;
    }
    const updated = (await res.json()) as WarrantySubmission;
    onPersisted?.(updated);
    router.refresh();
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 min-h-[60vh]">
        {WARRANTY_STATUSES.map((s) => (
          <KanbanColumn
            key={s}
            status={s}
            items={grouped[s].slice(0, MAX_PER_COLUMN)}
            overflow={Math.max(0, grouped[s].length - MAX_PER_COLUMN)}
            savingId={savingId}
          />
        ))}
      </div>
      <DragOverlay>
        {dragging && <ClaimCard claim={dragging} dragOverlay />}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  items,
  overflow,
  savingId,
}: {
  status: WarrantyStatus;
  items: WarrantySubmission[];
  overflow: number;
  savingId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="flex flex-col min-h-0">
      <div
        className={cn(
          "rounded-t-xl border-2 border-b-0 px-3 py-2 flex items-center justify-between gap-2",
          STATUS_COLUMN_HEADER[status],
        )}
      >
        <p className="text-[11px] font-bold uppercase tracking-wider text-foreground truncate">
          {WARRANTY_STATUS_LABELS[status]}
        </p>
        <span className="text-[10px] font-semibold text-muted-foreground bg-background border border-border/60 px-1.5 py-0.5 rounded-full">
          {items.length + overflow}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 rounded-b-xl border-2 border-t-0 px-2 py-2 space-y-2 transition-colors",
          STATUS_COLUMN_HEADER[status],
          isOver ? "ring-2 ring-foreground/30 ring-offset-1 ring-offset-background" : "",
        )}
      >
        {items.length === 0 && !isOver && (
          <p className="text-center text-[10px] text-muted-foreground/60 py-4">
            Empty
          </p>
        )}
        {items.map((claim) => (
          <DraggableCard
            key={claim.submissionId}
            claim={claim}
            saving={savingId === claim.submissionId}
          />
        ))}
        {overflow > 0 && (
          <p className="text-center text-[10px] text-muted-foreground py-2 border-t border-border/40 mt-2">
            +{overflow} more — switch to Table view to see them all
          </p>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  claim,
  saving,
}: {
  claim: WarrantySubmission;
  saving: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: claim.submissionId,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ touchAction: "none" }}
      {...attributes}
      {...listeners}
      className={cn(
        "block",
        isDragging && "opacity-30",
        saving && "opacity-60",
      )}
    >
      <ClaimCard claim={claim} saving={saving} />
    </div>
  );
}

function ClaimCard({
  claim,
  dragOverlay,
  saving,
}: {
  claim: WarrantySubmission;
  dragOverlay?: boolean;
  saving?: boolean;
}) {
  const fullName = [claim.name, claim.surname].filter(Boolean).join(" ").trim();
  const shortId = claim.submissionId.slice(0, 8);
  return (
    <div
      className={cn(
        "group relative rounded-lg border border-border bg-background p-2.5 cursor-grab active:cursor-grabbing shadow-sm hover:border-foreground/30 transition-colors",
        dragOverlay && "rotate-2 shadow-lg scale-105",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
          <Hash className="w-2.5 h-2.5" />
          {shortId}
        </span>
        {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      </div>
      <Link
        href={`/warranty/${encodeURIComponent(claim.submissionId)}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="block text-[12px] font-semibold text-foreground hover:underline leading-tight truncate"
      >
        {fullName || claim.email || "Unnamed"}
      </Link>
      <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-tight">
        {claim.productName || "—"}
      </p>
      {claim.serialNumber && (
        <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
          {claim.serialNumber}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-border/40">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          {claim.assignee ? (
            <>
              <span className="w-4 h-4 rounded-full bg-muted border border-border/60 flex items-center justify-center text-[8px] font-bold">
                {claim.assignee[0]}
              </span>
              {claim.assignee}
            </>
          ) : (
            <>
              <User className="w-2.5 h-2.5" />
              Unassigned
            </>
          )}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {fmtDate(claim.submittedAt)}
        </span>
      </div>
      {claim.notes.length > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-foreground text-background text-[9px] font-bold flex items-center justify-center">
          {claim.notes.length}
        </span>
      )}
      {claim.warrantyType && claim.warrantyType !== "open" && (
        <span className="absolute -bottom-1.5 left-2 inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-foreground text-background">
          <Wrench className="w-2 h-2" />
          {claim.warrantyType.replace("_", " ")}
        </span>
      )}
    </div>
  );
}
