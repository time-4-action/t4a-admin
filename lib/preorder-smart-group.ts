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

// Family key: case, spacing and the space before a "%" don't matter — the catalogue
// names a group "Patrik Mast SDM 80%" while Metakocka writes "Patrik Mast SDM 80 % 490".
export function familyKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+%/g, "%")
    .replace(/\s+/g, " ")
    .replace(/[\s\-–—,/]+$/, "");
}

// The family keys a group answers to: its own name, and the base of every variant
// name in it ("Patrik Mast SDM 80 % 380" → "patrik mast sdm 80%").
function groupFamilyKeys(g: { name: string; rows: { name: string }[] }): string[] {
  const keys = new Set<string>([familyKey(g.name)]);
  for (const r of g.rows) {
    const split = splitVariantName(r.name);
    if (split) keys.add(familyKey(split.base));
  }
  keys.delete("");
  return Array.from(keys);
}

type ExistingGroup = string | { name: string; rows: { name: string }[] };

// `existing` = the groups already on the tab (names, or name + rows): a lone product
// whose family matches one is renamed to that group's exact name so the caller can
// append it there. A lone product whose family matches a multi-variant group of THIS
// import joins that group (a Metakocka-only size of a catalogue product lands with its
// siblings). Otherwise lone products sharing a base merge into one group. Order is the
// input order throughout — the caller passes drafts in spreadsheet order.
export function smartGroup(drafts: SmartGroupDraft[], existing: ExistingGroup[] = []): SmartGroupDraft[] {
  const existingByKey = new Map<string, string>();
  for (const e of existing) {
    const g = typeof e === "string" ? { name: e, rows: [] } : e;
    for (const k of groupFamilyKeys(g)) if (!existingByKey.has(k)) existingByKey.set(k, g.name);
  }
  // Multi-variant groups of this import, by family.
  const multiByKey = new Map<string, SmartGroupDraft>();
  for (const d of drafts) {
    if (d.rows.length < 2) continue;
    for (const k of groupFamilyKeys(d)) if (!multiByKey.has(k)) multiByKey.set(k, d);
  }

  const lone = (d: SmartGroupDraft) => {
    if (d.rows.length !== 1) return null;
    const split = splitVariantName(d.name);
    return split ? { ...split, k: familyKey(split.base) } : null;
  };
  const withLabel = (d: SmartGroupDraft, suffix: string) => ({ ...d.rows[0], variantLabel: d.rows[0].variantLabel || suffix });

  // Lone products that join a multi-variant group of this import.
  const joins = new Map<SmartGroupDraft, SmartGroupDraft["rows"]>();
  const joined = new Set<SmartGroupDraft>();
  for (const d of drafts) {
    const l = lone(d);
    const target = l ? multiByKey.get(l.k) : undefined;
    if (!l || !target || target === d) continue;
    joins.set(target, [...(joins.get(target) ?? []), withLabel(d, l.suffix)]);
    joined.add(d);
  }

  const buckets = new Map<string, { draft: SmartGroupDraft; base: string; suffix: string }[]>();
  for (const d of drafts) {
    if (joined.has(d)) continue;
    const l = lone(d);
    if (!l) continue;
    buckets.set(l.k, [...(buckets.get(l.k) ?? []), { draft: d, base: l.base, suffix: l.suffix }]);
  }

  const out: SmartGroupDraft[] = [];
  const emitted = new Set<string>();
  for (const d of drafts) {
    if (joined.has(d)) continue;
    const extra = joins.get(d);
    if (extra) {
      out.push({ ...d, rows: [...d.rows, ...extra] });
      continue;
    }
    const l = lone(d);
    const bucket = l ? buckets.get(l.k) : undefined;
    const joinsExisting = l != null && existingByKey.has(l.k);
    if (!l || !bucket || (bucket.length < 2 && !joinsExisting)) {
      out.push(d);
      continue;
    }
    if (emitted.has(l.k)) continue;
    emitted.add(l.k);
    out.push({
      name: existingByKey.get(l.k) ?? bucket[0].base,
      parentCode: null,
      description: bucket.map((m) => m.draft.description).find(Boolean) ?? null,
      images: Array.from(new Set(bucket.flatMap((m) => m.draft.images ?? []))).slice(0, 8),
      rows: bucket.map((m) => withLabel(m.draft, m.suffix)),
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
