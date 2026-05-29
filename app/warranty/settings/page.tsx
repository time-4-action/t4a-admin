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
import {
  ArrowLeft,
  Check,
  Loader2,
  Mail,
  Users,
  X,
  Plus,
  AlertCircle,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

function emailValid(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

const SUBJECT_TOKENS_CUSTOMER = [
  "{{productName}}",
  "{{serialNumber}}",
  "{{shortId}}",
  "{{submissionId}}",
  "{{date}}",
] as const;
const SUBJECT_TOKENS_ADMIN = [
  "{{productName}}",
  "{{submissionId}}",
  "{{date}}",
  "{{name}}",
] as const;

// Sample values used to render a live "what it'll look like" preview of the
// subject line. Purely cosmetic — never sent.
const SAMPLE_TOKENS: Record<string, string> = {
  "{{productName}}": "Trail Pro 29",
  "{{serialNumber}}": "SN-A21K7",
  "{{shortId}}": "f3b27a18",
  "{{submissionId}}": "f3b27a18-9c42-4d11-b8a3-1e0d7f4a9c2e",
  "{{date}}": "24 May 2026",
  "{{name}}": "Anja Novak",
};

function renderPreview(s: string): string {
  let out = s;
  for (const [k, v] of Object.entries(SAMPLE_TOKENS)) {
    out = out.split(k).join(v);
  }
  return out;
}

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
      {/* Sticky header — same shape as every other page */}
      <header className="h-14 border-b border-border flex items-center px-4 md:px-8 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <Link
          href="/warranty"
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          Claims
        </Link>
        <span className="mx-2 text-border/60 select-none text-xs">/</span>
        <h1 className="font-display text-lg font-medium tracking-tight text-foreground">
          Email settings
        </h1>
      </header>

      {/* Centered scrollable canvas */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 md:py-10 pb-32 space-y-6">
          {loadError && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12px] text-destructive"
            >
              {loadError}
            </div>
          )}

          {!settings && !loadError && <LoadingSkeleton />}

          {settings && (
            <>
              <SectionCard
                icon={Users}
                accent="blue"
                title="Admin recipients"
                description="Every warranty submission BCCs each of these addresses. Recipients don't need an admin login."
                meta={`${settings.adminRecipients.length} ${
                  settings.adminRecipients.length === 1 ? "address" : "addresses"
                }`}
                delay={0}
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
                accent="emerald"
                title="Customer confirmation email"
                description="Sent to the customer immediately after they submit the warranty form."
                meta={`${settings.customer.fields.length}/${CUSTOMER_FIELD_KEYS.length} rows`}
                delay={60}
              >
                <Field
                  label="Subject"
                  tokens={SUBJECT_TOKENS_CUSTOMER}
                  onInsertToken={(tok) =>
                    setSettings({
                      ...settings,
                      customer: {
                        ...settings.customer,
                        subject: settings.customer.subject + tok,
                      },
                    })
                  }
                >
                  <Input
                    value={settings.customer.subject}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        customer: { ...settings.customer, subject: e.target.value },
                      })
                    }
                    className="h-9 text-[13px]"
                  />
                  <SubjectPreview value={settings.customer.subject} />
                </Field>

                <Field
                  label="Intro text"
                  hint="Free-form paragraphs. Blank line = new paragraph."
                >
                  <Textarea
                    value={settings.customer.intro}
                    rows={4}
                    onChange={(v) =>
                      setSettings({
                        ...settings,
                        customer: { ...settings.customer, intro: v },
                      })
                    }
                  />
                </Field>

                <Field
                  label="Outro text"
                  hint="Shown after the receipt button, before the signoff."
                >
                  <Textarea
                    value={settings.customer.outro}
                    rows={3}
                    onChange={(v) =>
                      setSettings({
                        ...settings,
                        customer: { ...settings.customer, outro: v },
                      })
                    }
                  />
                </Field>

                <Field
                  label="Detail rows shown to the customer"
                  hint="Toggle off to remove a row from the receipt table in the email."
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
                accent="amber"
                title="Admin notification email"
                description="Sent to every recipient above whenever a warranty form is submitted."
                meta={`${settings.admin.fields.length}/${ADMIN_FIELD_KEYS.length} fields`}
                delay={120}
              >
                <Field
                  label="Subject"
                  tokens={SUBJECT_TOKENS_ADMIN}
                  onInsertToken={(tok) =>
                    setSettings({
                      ...settings,
                      admin: {
                        ...settings.admin,
                        subject: settings.admin.subject + tok,
                      },
                    })
                  }
                >
                  <Input
                    value={settings.admin.subject}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        admin: { ...settings.admin, subject: e.target.value },
                      })
                    }
                    className="h-9 text-[13px]"
                  />
                  <SubjectPreview value={settings.admin.subject} />
                </Field>

                <Field
                  label="Intro text"
                  hint="Appears under the header. Leave blank for no intro paragraph."
                >
                  <Textarea
                    value={settings.admin.intro}
                    rows={3}
                    onChange={(v) =>
                      setSettings({
                        ...settings,
                        admin: { ...settings.admin, intro: v },
                      })
                    }
                  />
                </Field>

                <Field
                  label="Submission fields included"
                  hint='Toggle off to omit a row from the email. "Uploaded files (section)" toggles the entire uploads block.'
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
      </div>

      {/* Sticky save bar — same pattern as the original, just nicer states */}
      {settings && (
        <div className="border-t border-border bg-background/95 backdrop-blur-sm sticky bottom-0 z-10">
          <div className="max-w-3xl mx-auto px-4 md:px-8 py-3 flex items-center gap-3">
            {saveError ? (
              <p className="flex items-center gap-1.5 text-[12px] text-destructive">
                <AlertCircle className="w-3.5 h-3.5" />
                {saveError}
              </p>
            ) : saved ? (
              <p className="flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                Settings saved
              </p>
            ) : dirty ? (
              <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-foreground/70" />
                Unsaved changes
              </p>
            ) : (
              <p className="text-[12px] text-muted-foreground">All changes saved</p>
            )}
            <div className="ml-auto">
              <Button
                size="sm"
                className={cn(
                  "h-8 text-xs px-4 transition-colors",
                  saved && "bg-emerald-600 hover:bg-emerald-600 border-emerald-600",
                )}
                onClick={save}
                disabled={!dirty || saving || saved}
              >
                {saved ? (
                  <span className="flex items-center gap-1.5">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                ) : saving ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                  </span>
                ) : (
                  "Save settings"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section card ────────────────────────────────────────────────────────────
type Accent = "blue" | "emerald" | "amber";

const ACCENTS: Record<
  Accent,
  { tile: string; icon: string; badge: string; bar: string }
> = {
  blue: {
    tile: "bg-blue-500/10 ring-1 ring-inset ring-blue-500/20",
    icon: "text-blue-600 dark:text-blue-400",
    badge:
      "bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-500/20",
    bar: "bg-blue-500/70",
  },
  emerald: {
    tile: "bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20",
    icon: "text-emerald-600 dark:text-emerald-400",
    badge:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/20",
    bar: "bg-emerald-500/70",
  },
  amber: {
    tile: "bg-amber-500/10 ring-1 ring-inset ring-amber-500/20",
    icon: "text-amber-600 dark:text-amber-400",
    badge:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-500/20",
    bar: "bg-amber-500/70",
  },
};

function SectionCard({
  icon: Icon,
  accent = "blue",
  title,
  description,
  meta,
  delay = 0,
  children,
}: {
  icon: React.ElementType;
  accent?: Accent;
  title: string;
  description?: string;
  meta?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  const a = ACCENTS[accent];
  return (
    <section
      className="bg-background border border-border rounded-2xl shadow-sm overflow-hidden reveal"
      style={{ animationDelay: `${delay}ms` }}
    >
      <header className="relative px-5 py-4 border-b border-border/60 flex items-start gap-3">
        <span
          className={cn("absolute inset-y-0 left-0 w-1", a.bar)}
          aria-hidden
        />
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
            a.tile,
          )}
        >
          <Icon className={cn("w-4 h-4", a.icon)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">{title}</p>
          {description && (
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              {description}
            </p>
          )}
        </div>
        {meta && (
          <span
            className={cn(
              "shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full tabular-nums whitespace-nowrap",
              a.badge,
            )}
          >
            {meta}
          </span>
        )}
      </header>
      <div className="p-5 space-y-5">{children}</div>
    </section>
  );
}

// ── Field group ─────────────────────────────────────────────────────────────
function Field({
  label,
  hint,
  tokens,
  onInsertToken,
  children,
}: {
  label: string;
  hint?: string;
  tokens?: readonly string[];
  onInsertToken?: (token: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
        {tokens && onInsertToken && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mr-0.5">
              Insert
            </span>
            {tokens.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onInsertToken(t)}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-background transition-colors"
                title={`Insert ${t}`}
              >
                {t.replace(/[{}]/g, "")}
              </button>
            ))}
          </div>
        )}
      </div>
      {children}
      {hint && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">{hint}</p>
      )}
    </div>
  );
}

function Textarea({
  value,
  onChange,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-[13px] shadow-xs outline-none resize-y focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    />
  );
}

function SubjectPreview({ value }: { value: string }) {
  const preview = renderPreview(value);
  return (
    <p className="text-[11px] text-muted-foreground leading-relaxed">
      <span className="text-muted-foreground/70">Preview: </span>
      {preview ? (
        <span className="text-foreground/80">{preview}</span>
      ) : (
        <span className="text-muted-foreground/60">(empty subject)</span>
      )}
    </p>
  );
}

// ── Recipients editor ───────────────────────────────────────────────────────
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
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {recipients.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            No recipients yet. Admin notifications will be skipped until you add
            at least one.
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
                onClick={() =>
                  onChange(recipients.filter((r) => r !== email))
                }
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
        <div className="relative flex-1">
          <Mail
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none"
            aria-hidden
          />
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
            className="h-8 pl-8 text-[13px]"
          />
        </div>
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

// ── Field checklist (toggle rows) ───────────────────────────────────────────
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
  const allOn = selected.length === catalog.length;
  function toggle(key: K, checked: boolean) {
    const next = catalog.filter((k) => (k === key ? checked : selectedSet.has(k)));
    onChange(next);
  }
  function toggleAll() {
    onChange(allOn ? [] : [...catalog]);
  }
  return (
    <div className="rounded-lg border border-border/70 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/60">
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {selected.length}{" "}
          <span className="text-muted-foreground/70">of {catalog.length} on</span>
        </p>
        <button
          type="button"
          onClick={toggleAll}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
        >
          {allOn ? "Turn all off" : "Turn all on"}
        </button>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border/40">
        {catalog.map((key) => {
          const checked = selectedSet.has(key);
          return (
            <li key={key} className="bg-background">
              <label className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer group">
                <span
                  className={cn(
                    "text-[12px] truncate transition-colors",
                    checked
                      ? "text-foreground"
                      : "text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  {labels[key]}
                </span>
                <Toggle
                  checked={checked}
                  onChange={(v) => toggle(key, v)}
                  ariaLabel={labels[key]}
                />
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[18px] w-[30px] shrink-0 rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        checked ? "bg-emerald-500" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 inline-block h-[14px] w-[14px] rounded-full bg-background shadow-sm transition-transform duration-150",
          checked && "translate-x-3",
        )}
      />
    </button>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <>
      {[0, 1, 2].map((s) => (
        <div
          key={s}
          className="bg-background border border-border rounded-2xl shadow-sm overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border/60 flex items-start gap-3">
            <div
              className="skeleton w-8 h-8 rounded-lg shrink-0"
              style={{ animationDelay: `${s * 80}ms` }}
            />
            <div className="flex-1 space-y-1.5 mt-0.5">
              <div
                className="skeleton h-3 w-40 rounded"
                style={{ animationDelay: `${s * 80 + 20}ms` }}
              />
              <div
                className="skeleton h-2.5 w-60 max-w-full rounded"
                style={{ animationDelay: `${s * 80 + 40}ms` }}
              />
            </div>
            <div
              className="skeleton h-4 w-14 rounded-full"
              style={{ animationDelay: `${s * 80 + 60}ms` }}
            />
          </div>
          <div className="p-5 space-y-4">
            {[0, 1, 2].map((r) => (
              <div key={r} className="space-y-1.5">
                <div
                  className="skeleton h-2 w-20 rounded"
                  style={{ animationDelay: `${s * 80 + r * 50}ms` }}
                />
                <div
                  className="skeleton h-8 w-full rounded-md"
                  style={{ animationDelay: `${s * 80 + r * 50 + 25}ms` }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
