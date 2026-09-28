// lib/preorder-smart-group.ts — "Smart grouping" for the Import SKUs dialog (pure).
//
// A catalogue product arrives as one group holding all its variants, but products that
// live only in Metakocka (or catalogue parents without variants) arrive one group per
// SKU: "T4A QTS-Wave 71", "T4A QTS-Wave 76", … each on its own. Smart grouping merges
// such single-row groups whose names differ only in a trailing size token into one
// group named after the shared base ("T4A QTS-Wave"), the token becoming the row's
// variant label. Multi-row groups are left exactly as resolved.

import type { PreorderRow } from "@/types/preorder";

type RowDraft = Omit<PreorderRow, "id" | "order">;
export type SmartGroupDraft = {
  name: string;
  parentCode?: string | null;
  description?: string | null;
  images?: string[];
  rows: RowDraft[];
};

// A trailing token that reads as a size / model variant: anything with a digit
// ("71", "4.7", "490", "10'6"), or a clothing size.
const SIZE_TOKEN = /\d|^(?:XXS|XS|S|M|L|XL|XXL|XXXL|\dXL)$/i;

export function splitVariantName(name: string): { base: string; suffix: string } | null {
  const tokens = name.trim().split(/\s+/);
  if (tokens.length < 2) return null;
  const suffix = tokens[tokens.length - 1];
  if (!SIZE_TOKEN.test(suffix)) return null;
  const base = tokens.slice(0, -1).join(" ").replace(/[\s\-–—,/]+$/, "");
  return base ? { base, suffix } : null;
}

const key = (s: string) => s.trim().toLowerCase();
const bySuffix = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

// `existingNames` = group names already on the tab: a lone product whose base matches
// one is renamed to that group's name so the caller can append it there.
export function smartGroup(drafts: SmartGroupDraft[], existingNames: string[] = []): SmartGroupDraft[] {
  const existing = new Map(existingNames.map((n) => [key(n), n]));
  const buckets = new Map<string, { draft: SmartGroupDraft; base: string; suffix: string }[]>();
  for (const d of drafts) {
    if (d.rows.length !== 1) continue;
    const split = splitVariantName(d.name);
    if (!split) continue;
    const list = buckets.get(key(split.base)) ?? [];
    list.push({ draft: d, ...split });
    buckets.set(key(split.base), list);
  }

  const out: SmartGroupDraft[] = [];
  const emitted = new Set<string>();
  for (const d of drafts) {
    const split = d.rows.length === 1 ? splitVariantName(d.name) : null;
    const k = split ? key(split.base) : null;
    const bucket = k ? buckets.get(k) : undefined;
    const joinsExisting = k != null && existing.has(k);
    if (!split || !bucket || (bucket.length < 2 && !joinsExisting)) {
      out.push(d);
      continue;
    }
    if (emitted.has(k!)) continue;
    emitted.add(k!);
    const members = [...bucket].sort((a, b) => bySuffix(a.suffix, b.suffix));
    out.push({
      name: existing.get(k!) ?? members[0].base,
      parentCode: null,
      description: members.map((m) => m.draft.description).find(Boolean) ?? null,
      images: Array.from(new Set(members.flatMap((m) => m.draft.images ?? []))).slice(0, 8),
      rows: members.map((m) => ({ ...m.draft.rows[0], variantLabel: m.draft.rows[0].variantLabel || m.suffix })),
    });
  }
  return out;
}

// ── Smart variant labels ────────────────────────────────────────────────────────
//
// The catalogue names every variant in full ("Patrik Fin PPW Slot 80", "… Slot 90"),
// and that full name used to land in the "Size / label" column. The useful label is
// the part that differs between the group's variants: the words left after the
// name prefix they all share ("80", "90"). A lone variant falls back to its trailing
// size token. Only labels that are empty or still equal to the full name are
// touched — a label an admin typed is never rewritten.

type LabelRow = { name: string; variantLabel?: string | null };

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

function isUnshortened(r: LabelRow): boolean {
  const l = r.variantLabel?.trim();
  return !l || same(l, r.name.trim());
}

// The label each row should carry (null = leave the row's label as it is).
export function smartVariantLabels(rows: LabelRow[]): (string | null)[] {
  const named = rows.filter((r) => r.name.trim());
  if (named.length >= 2) {
    const split = named.map((r) => words(r.name));
    let n = 0;
    while (split.every((w) => n < w.length - 1 && same(w[n], split[0][n]))) n++;
    return rows.map((r) => {
      if (!isUnshortened(r) || n === 0) return null;
      const rest = words(r.name).slice(n).join(" ");
      return rest && rest !== r.variantLabel ? rest : null;
    });
  }
  return rows.map((r) => {
    if (!isUnshortened(r) || !r.variantLabel) return null;
    return splitVariantName(r.name)?.suffix ?? null;
  });
}

// Apply smartVariantLabels to a group's rows; returns the same array when nothing changes.
export function withSmartLabels<T extends LabelRow>(rows: T[]): T[] {
  const labels = smartVariantLabels(rows);
  if (labels.every((l) => l == null)) return rows;
  return rows.map((r, i) => (labels[i] == null ? r : { ...r, variantLabel: labels[i] }));
}
