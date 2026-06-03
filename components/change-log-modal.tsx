"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight, History } from "lucide-react";
import type { AuditChange } from "@/types/warranty";

/**
 * Confirmation dialog shown before a save is committed. Lists the pending
 * changes (label · before → after) and lets the user add an optional note that
 * gets recorded in the change history alongside their name.
 */
export function ChangeLogModal({
  open,
  onOpenChange,
  changes,
  saving,
  error,
  onConfirm,
  title = "Save changes",
  confirmLabel = "Save",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changes: AuditChange[];
  saving: boolean;
  error?: string | null;
  onConfirm: (message: string) => void;
  title?: string;
  confirmLabel?: string;
}) {
  const [message, setMessage] = useState("");

  // Start each save with a blank note.
  useEffect(() => {
    if (open) setMessage("");
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!saving) onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            {title}
          </DialogTitle>
          <DialogDescription>
            This will be recorded in the history under your name. Add a note so
            the team knows what changed and why (optional).
          </DialogDescription>
        </DialogHeader>

        {changes.length > 0 && (
          <div className="rounded-lg border border-border/60 bg-muted/30 divide-y divide-border/50 max-h-56 overflow-y-auto">
            {changes.map((c) => (
              <div key={c.field} className="px-3 py-2 space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {c.label}
                </p>
                <p className="flex items-center gap-1.5 text-[12px] flex-wrap">
                  <span className="text-muted-foreground line-through">
                    {c.from || "—"}
                  </span>
                  <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                  <span className="text-foreground font-medium">
                    {c.to || "—"}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          autoFocus
          disabled={saving}
          placeholder="e.g. Customer sent the missing invoice, moving to review."
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-[13px] outline-none resize-y focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
        />

        {error && <p className="text-[12px] text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={() => onConfirm(message.trim())} disabled={saving}>
            {saving ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
              </span>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
