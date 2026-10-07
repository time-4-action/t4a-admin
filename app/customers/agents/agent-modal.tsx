"use client";

// Create / edit a portal agent: the agent's own customer (fixed once created), the
// client customers they may see and order for, and an internal note.

import { useEffect, useState } from "react";
import { Briefcase, Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorModal, EditorModalBody, EditorModalFooter, EditorModalHeader } from "@/components/ui/editor-modal";
import { CustomerDirectoryPicker, type PickedCustomer } from "@/components/customer-directory-picker";
import { ViewAsCustomerButton } from "@/components/view-as-customer-button";
import type { PortalAgentView } from "@/types/portal-agent";

export function AgentModal({
  open,
  onOpenChange,
  agent,
  seed,
  agentIds,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Editing an existing agent, or null for a new one.
  agent: PortalAgentView | null;
  // New agent pre-picked (from a Customers row).
  seed?: PickedCustomer | null;
  // Every existing agent's id — a customer can be an agent only once.
  agentIds: Set<string>;
  onSaved: (agent: PortalAgentView) => void;
  onDeleted: (partnerMkId: string) => void;
}) {
  const [who, setWho] = useState<PickedCustomer[]>([]);
  const [clients, setClients] = useState<PickedCustomer[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWho(agent ? [{ partnerMkId: agent.partnerMkId, partnerName: agent.partnerName }] : seed ? [seed] : []);
    setClients(agent ? agent.clients.map((c) => ({ partnerMkId: c.partnerMkId, partnerName: c.partnerName })) : []);
    setNote(agent?.note ?? "");
    setError(null);
    setConfirmDelete(false);
  }, [open, agent, seed]);

  const self = who[0] ?? null;

  async function save() {
    if (!self) {
      setError("Pick the agent's own customer account first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = agent
        ? await fetch(`/api/admin/portal/agents/${encodeURIComponent(agent.partnerMkId)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clients, note }),
          })
        : await fetch("/api/admin/portal/agents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partnerMkId: self.partnerMkId, partnerName: self.partnerName, clients, note }),
          });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `Save failed (${r.status})`);
      onSaved(j.agent as PortalAgentView);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!agent) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/portal/agents/${encodeURIComponent(agent.partnerMkId)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`Delete failed (${r.status})`);
      onDeleted(agent.partnerMkId);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditorModal open={open} onOpenChange={onOpenChange} sizeClassName="w-[min(720px,calc(100vw-2rem))] max-h-[min(760px,calc(100vh-2rem))]">
      <EditorModalHeader
        leading={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <Briefcase className="size-5" />
          </span>
        }
        title={self?.partnerName || "New agent"}
        description={
          agent
            ? `${clients.length} client${clients.length === 1 ? "" : "s"}. The agent sees their own documents and preorders plus those of every client, and can place preorders for them.`
            : "An agent logs in to the portal like any customer (with their own email) and additionally sees the clients assigned here."
        }
        right={agent ? <ViewAsCustomerButton partnerMkId={agent.partnerMkId} to="/portal/invoices" /> : undefined}
      />
      <EditorModalBody className="overflow-y-auto px-6 py-5 space-y-6">
        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold text-foreground">Agent</h3>
          <p className="text-[12px] text-muted-foreground">
            The agent&rsquo;s own customer account. Their portal login is the email of this Metakocka partner.
          </p>
          {agent ? (
            <p className="text-[13px] text-foreground rounded-lg border border-border bg-muted/30 px-3 py-2">
              {agent.partnerName} <span className="text-muted-foreground font-mono text-[11px]">· {agent.partnerMkId}</span>
            </p>
          ) : (
            <CustomerDirectoryPicker
              value={who}
              onChange={setWho}
              max={1}
              exclude={Array.from(agentIds)}
              placeholder="Search the agent's customer account…"
            />
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold text-foreground">
            Clients <span className="text-muted-foreground font-normal">({clients.length})</span>
          </h3>
          <p className="text-[12px] text-muted-foreground">
            Customers this agent may see: invoices, sales orders, credit notes and preorders. A preorder still has to be
            unlocked for the client (invite link or &ldquo;Unlock&rdquo; in the campaign) before the agent can fill it.
          </p>
          <CustomerDirectoryPicker
            value={clients}
            onChange={setClients}
            exclude={self ? [self.partnerMkId] : []}
            hint={(c) => (agentIds.has(c.partnerMkId) ? "is an agent" : null)}
            placeholder="Add a client: name, email or VAT id…"
          />
        </section>

        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold text-foreground">Internal note</h3>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Not shown to the agent: region, agreement, contact…"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] focus:border-ring focus:outline-none"
          />
        </section>
      </EditorModalBody>
      <EditorModalFooter>
        <div className="flex items-center gap-2">
          {agent &&
            (confirmDelete ? (
              <>
                <span className="text-[11px] text-muted-foreground">Remove agent access? They keep their own account only.</span>
                <Button size="sm" variant="destructive" onClick={remove} disabled={saving}>
                  Remove
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Trash2 className="w-3.5 h-3.5" /> Remove agent
              </Button>
            ))}
          {error && <p className="text-[12px] text-destructive">{error}</p>}
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !self}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {agent ? "Save agent" : "Create agent"}
          </Button>
        </div>
      </EditorModalFooter>
    </EditorModal>
  );
}
