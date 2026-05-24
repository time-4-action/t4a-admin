"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ADMIN_FIELD_KEYS,
  ADMIN_FIELD_LABELS,
  CUSTOMER_FIELD_KEYS,
  CUSTOMER_FIELD_LABELS,
  type AdminFieldKey,
  type CustomerFieldKey,
  type WarrantySettings,
} from "@/types/warranty";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Check, Loader2, Mail, Users, X, Plus, AlertCircle, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

function emailValid(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background border border-border rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border/60 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">{title}</p>
          {description && (
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground leading-relaxed">{hint}</p>}
    </div>
  );
}

function RecipientsEditor({
  recipients,
  onChange,
}: {
  recipients: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const value = draft.trim();
    if (!value) return;
    if (!emailValid(value)) {
      setError("That doesn't look like a valid email.");
      return;
    }
    if (recipients.includes(value)) {
      setError("Already in the list.");
      return;
    }
    onChange([...recipients, value]);
    setDraft("");
    setError(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {recipients.length === 0 ? (
          <p className="text-[12px] text-muted-foreground italic">
            No recipients yet. Admin notifications will be skipped until you add at least one.
          </p>
        ) : (
          recipients.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full border border-border bg-muted/40 text-[12px] text-foreground"
            >
              {email}
              <button
                type="button"
                onClick={() => onChange(recipients.filter((r) => r !== email))}
                className="w-4 h-4 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label={`Remove ${email}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="email"
          value={draft}
          placeholder="someone@example.com"
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          className="h-8 text-[13px] flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={add}
          disabled={!draft.trim()}
        >
          <Plus className="w-3 h-3" />
          Add
        </Button>
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}

function FieldChecklist<K extends string>({
  catalog,
  labels,
  selected,
  onChange,
}: {
  catalog: K[];
  labels: Record<K, string>;
  selected: K[];
  onChange: (next: K[]) => void;
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  function toggle(key: K, checked: boolean) {
    const next = catalog.filter((k) => (k === key ? checked : selectedSet.has(k)));
    onChange(next);
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {catalog.map((key) => {
        const checked = selectedSet.has(key);
        return (
          <label
            key={key}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] cursor-pointer transition-colors select-none",
              checked
                ? "border-foreground/20 bg-muted/40 text-foreground"
                : "border-border/60 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => toggle(key, e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border"
            />
            <span className="truncate">{labels[key]}</span>
          </label>
        );
      })}
    </div>
  );
}

const SUBJECT_TOKENS_CUSTOMER = ["{{productName}}", "{{serialNumber}}", "{{shortId}}", "{{submissionId}}", "{{date}}"];
const SUBJECT_TOKENS_ADMIN = ["{{productName}}", "{{submissionId}}", "{{date}}", "{{name}}"];

export default function WarrantySettingsPage() {
  const [settings, setSettings] = useState<WarrantySettings | null>(null);
  const [original, setOriginal] = useState<WarrantySettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/warranty/settings")
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setLoadError(data?.error ?? "Failed to load settings");
          return;
        }
        setSettings(data as WarrantySettings);
        setOriginal(data as WarrantySettings);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => {
    if (!settings || !original) return false;
    return JSON.stringify(settings) !== JSON.stringify(original);
  }, [settings, original]);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setSaveError(null);
    const res = await fetch("/api/warranty/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSaveError(data?.error ?? "Failed to save");
      return;
    }
    const data = (await res.json()) as WarrantySettings;
    setSettings(data);
    setOriginal(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b border-border flex items-center px-4 md:px-8 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <Link
          href="/warranty"
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          Claims
        </Link>
        <span className="mx-2 text-border/60 select-none text-xs">/</span>
        <h1 className="font-display text-lg font-medium tracking-tight text-foreground">Email settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-3xl space-y-6 pb-24">
        {loadError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12px] text-destructive">
            {loadError}
          </div>
        )}

        {!settings && !loadError && (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-background border border-border rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="skeleton h-4 w-40 rounded" style={{ animationDelay: `${i * 60}ms` }} />
                <div className="skeleton h-8 w-full rounded" style={{ animationDelay: `${i * 60 + 30}ms` }} />
                <div className="skeleton h-20 w-full rounded" style={{ animationDelay: `${i * 60 + 60}ms` }} />
              </div>
            ))}
          </>
        )}

        {settings && (
          <>
            <SectionCard
              icon={Users}
              title="Admin recipients"
              description="Every warranty submission BCCs each of these addresses. Recipients don't need an admin login."
            >
              <RecipientsEditor
                recipients={settings.adminRecipients}
                onChange={(adminRecipients) =>
                  setSettings({ ...settings, adminRecipients })
                }
              />
            </SectionCard>

            <SectionCard
              icon={Mail}
              title="Customer confirmation email"
              description="Sent to the customer immediately after they submit the warranty form."
            >
              <Field
                label="Subject"
                hint={`Tokens: ${SUBJECT_TOKENS_CUSTOMER.join(" ")}`}
              >
                <Input
                  value={settings.customer.subject}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      customer: { ...settings.customer, subject: e.target.value },
                    })
                  }
                  className="h-8 text-[13px]"
                />
              </Field>

              <Field
                label="Intro text"
                hint="Free-form paragraphs. Blank line = new paragraph."
              >
                <textarea
                  value={settings.customer.intro}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      customer: { ...settings.customer, intro: e.target.value },
                    })
                  }
                  rows={4}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-[13px] shadow-xs outline-none resize-y focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </Field>

              <Field
                label="Outro text"
                hint="Shown after the receipt button, before the signoff."
              >
                <textarea
                  value={settings.customer.outro}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      customer: { ...settings.customer, outro: e.target.value },
                    })
                  }
                  rows={3}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-[13px] shadow-xs outline-none resize-y focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </Field>

              <Field
                label="Detail rows shown to the customer"
                hint="Uncheck to remove a row from the receipt table in the email."
              >
                <FieldChecklist<CustomerFieldKey>
                  catalog={CUSTOMER_FIELD_KEYS}
                  labels={CUSTOMER_FIELD_LABELS}
                  selected={settings.customer.fields}
                  onChange={(fields) =>
                    setSettings({
                      ...settings,
                      customer: { ...settings.customer, fields },
                    })
                  }
                />
              </Field>
            </SectionCard>

            <SectionCard
              icon={Megaphone}
              title="Admin notification email"
              description="Sent to every recipient above whenever a warranty form is submitted."
            >
              <Field
                label="Subject"
                hint={`Tokens: ${SUBJECT_TOKENS_ADMIN.join(" ")}`}
              >
                <Input
                  value={settings.admin.subject}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      admin: { ...settings.admin, subject: e.target.value },
                    })
                  }
                  className="h-8 text-[13px]"
                />
              </Field>

              <Field
                label="Intro text"
                hint="Appears under the header. Leave blank for no intro paragraph."
              >
                <textarea
                  value={settings.admin.intro}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      admin: { ...settings.admin, intro: e.target.value },
                    })
                  }
                  rows={3}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-[13px] shadow-xs outline-none resize-y focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </Field>

              <Field
                label="Submission fields included"
                hint='Uncheck a row to omit it from the email. "Uploaded files (section)" toggles the entire uploads block.'
              >
                <FieldChecklist<AdminFieldKey>
                  catalog={ADMIN_FIELD_KEYS}
                  labels={ADMIN_FIELD_LABELS}
                  selected={settings.admin.fields}
                  onChange={(fields) =>
                    setSettings({
                      ...settings,
                      admin: { ...settings.admin, fields },
                    })
                  }
                />
              </Field>
            </SectionCard>

          </>
        )}
      </div>

      {settings && (
        <div className="border-t border-border bg-background/95 backdrop-blur-sm px-4 md:px-8 py-3 flex items-center justify-end gap-3 sticky bottom-0">
          {saveError && (
            <p className="text-[12px] text-destructive mr-auto">{saveError}</p>
          )}
          {dirty && !saved && (
            <p className="text-[11px] text-muted-foreground">Unsaved changes</p>
          )}
          <Button
            size="sm"
            className={cn(
              "h-8 text-xs px-4 transition-all duration-200",
              saved && "bg-emerald-600 hover:bg-emerald-600 border-emerald-600",
            )}
            onClick={save}
            disabled={!dirty || saving || saved}
          >
            {saved ? (
              <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>
            ) : saving ? (
              <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</span>
            ) : "Save settings"}
          </Button>
        </div>
      )}
    </div>
  );
}
