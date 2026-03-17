"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/lib/currency-context";

export default function LimitDialog({
  user, onClose, onSaved,
}: { user: any; onClose: () => void; onSaved: () => void }) {
  const { currency, toDisplay, toUsd } = useCurrency();

  const initialDisplay = user.limit?.limitUsd != null
    ? toDisplay(user.limit.limitUsd).toFixed(2)
    : "";

  const [limitValue, setLimitValue] = useState<string>(initialDisplay);
  const [period, setPeriod] = useState<string>(user.limit?.period ?? "monthly");
  const [saving, setSaving] = useState(false);

  const symbol = currency === "EUR" ? "€" : "$";

  async function save() {
    setSaving(true);
    const limitUsd = toUsd(parseFloat(limitValue));
    await fetch(`/api/admin/users/${user.id}/limit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limitUsd, period }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set spending limit — {user.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium">Limit ({currency})</label>
            <div className="relative mt-1.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
                {symbol}
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={limitValue}
                onChange={(e) => setLimitValue(e.target.value)}
                placeholder="e.g. 10.00"
                className="pl-7"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Period</label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="total">Total (never resets)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !limitValue}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
