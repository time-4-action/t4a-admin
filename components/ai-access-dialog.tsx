"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bot, AlertTriangle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 shrink-0",
        on ? "bg-blue-500" : "bg-muted border border-border"
      )}
    >
      <span className={cn(
        "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200",
        on ? "translate-x-5" : "translate-x-0"
      )} />
    </button>
  );
}

interface Props {
  user: any;
  onConfirm: () => void;
  onClose: () => void;
}

export default function AiAccessDialog({ user, onConfirm, onClose }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    await onConfirm();
    setSaving(false);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="sr-only">Grant AI Access</DialogTitle>
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center shadow-sm shadow-blue-200 shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Grant AI Access</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {user.name}
              {user.email && <span className="opacity-60"> · {user.email}</span>}
            </p>
          </div>
        </div>

        {/* Warning card */}
        <div className="rounded-xl border border-border bg-background p-4 space-y-2.5">
          <div className="flex gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              This will grant <strong className="text-foreground">{user.name}</strong> access to all AI features and <strong className="text-foreground">company data</strong>. Usage is billed and may generate <strong className="text-foreground">additional costs</strong>.
            </p>
          </div>
        </div>

        {/* Toggle confirmation */}
        <div className={cn(
          "rounded-xl border p-4 transition-all duration-200",
          confirmed
            ? "border-blue-300 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-600/60"
            : "border-border bg-background"
        )}>
          <div className="flex items-center justify-between gap-3">
            <p className={cn(
              "text-[13px] font-medium transition-colors",
              confirmed ? "text-blue-700 dark:text-blue-300" : "text-muted-foreground"
            )}>
              I understand and confirm
            </p>
            <Toggle on={confirmed} onToggle={() => setConfirmed((v) => !v)} />
          </div>
          {confirmed && (
            <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-blue-200 dark:border-blue-800 text-[11px] font-medium text-blue-600 dark:text-blue-400">
              <Check className="w-3 h-3 shrink-0" />
              Access to AI features, company data, and billing confirmed.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!confirmed || saving}
            className={cn(
              "transition-all duration-200",
              confirmed && "bg-blue-500 hover:bg-blue-600 border-blue-500 text-white"
            )}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? "Saving…" : "Grant access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
