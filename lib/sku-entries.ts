// lib/sku-entries.ts — what the Import SKUs dialog reads (pure; browser + server).
//
// One product per line: a SKU or EAN, optionally followed by a tag after a tab, comma
// or semicolon —
//
//   SKU / EAN, Tag            ← optional header line, skipped
//   P07260003140, NEW
//   4262434064904	SALE
//   P07260003145
//
// A field is a code when it looks like one (≥ 6 characters, at least one digit, only
// letters / digits / . _ - /); anything else on the line is the tag, and a tag applies
// to every code on its line. Several codes on one line (space / comma separated, as
// before) still work. Duplicate codes collapse; a later tag for the same code wins.

export type SkuEntry = { code: string; tag: string | null };

export const SKU_CODE_RE = /^(?=.*\d)[A-Za-z0-9][A-Za-z0-9._\-/]{5,}$/;
const HEADER_RE = /\b(sku|ean|code|barcode)\b/i;
export const TAG_MAX = 24;

export function isSkuCode(v: string): boolean {
  return SKU_CODE_RE.test(v.trim());
}

function lineEntries(line: string): SkuEntry[] {
  const fields = line.split(/[\t,;]+/).map((f) => f.trim()).filter(Boolean);
  const codes: string[] = [];
  const rest: string[] = [];
  for (const f of fields) {
    const tokens = f.split(/\s+/);
    // "P1 P2" (several codes) vs "LAST PIECES" (a tag) vs "P1 NEW" (code + tag).
    if (tokens.every(isSkuCode)) codes.push(...tokens);
    else if (tokens.length > 1 && isSkuCode(tokens[0]) && fields.length === 1) {
      codes.push(tokens[0]);
      rest.push(tokens.slice(1).join(" "));
    } else rest.push(f);
  }
  const tag = rest.join(" ").trim().slice(0, TAG_MAX) || null;
  return codes.map((code) => ({ code, tag }));
}

export function parseSkuEntries(raw: string): SkuEntry[] {
  const byCode = new Map<string, SkuEntry>();
  const lines = raw.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const entries = lineEntries(line);
    // A header names the columns ("SKU / EAN, Tag") and carries no code.
    if (entries.length === 0 && HEADER_RE.test(line) && i < 3) return;
    for (const e of entries) {
      const prev = byCode.get(e.code);
      byCode.set(e.code, { code: e.code, tag: e.tag ?? prev?.tag ?? null });
    }
  });
  return Array.from(byCode.values());
}

// Back to the text box form (one "code<TAB>tag" per line), so what is about to be
// imported is always visible and editable.
export function formatSkuEntries(entries: SkuEntry[]): string {
  return entries.map((e) => (e.tag ? `${e.code}\t${e.tag}` : e.code)).join("\n");
}

// Lookup key for matching resolved rows back to the requested code: codes compare
// case-insensitively, EANs with leading zeros dropped (a spreadsheet eats them).
export function skuKey(v: string | null | undefined): string | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? t.replace(/^0+/, "") : t.toUpperCase();
}
