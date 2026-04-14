"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface EditUserDialogProps {
  user: { id: string; name: string; email: string; picture?: string };
  onClose: () => void;
  onSaved: () => void;
}

export default function EditUserDialog({ user, onClose, onSaved }: EditUserDialogProps) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [pictureUrl, setPictureUrl] = useState(user.picture ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const payload: Record<string, string> = { name, email };
    if (pictureUrl) payload.picture = pictureUrl;

    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save");
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user — {user.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <Input className="mt-1.5" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Avatar URL</label>
            <Input
              className="mt-1.5"
              placeholder="https://..."
              value={pictureUrl}
              onChange={(e) => setPictureUrl(e.target.value)}
            />
            {pictureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pictureUrl} alt="Avatar preview" className="mt-3 w-12 h-12 rounded-full border border-border object-cover" />
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name || !email}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
