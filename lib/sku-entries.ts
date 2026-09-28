// lib/sku-entries.ts — what the Import SKUs dialog reads (pure; browser + server).
//
// One product per line: a SKU or EAN, optionally followed by a tag and prices after a
// tab, comma or semicolon —
//
//   SKU / EAN, Tag, Partner price, RRP      ← optional header line, skipped
//   P07260003140, NEW, 82.50, RRP 129.90
//   4262434064904	SALE	82,50	FIXED
//   P07260003145
//
// A field reading FIXED (or "fixed price" / "no discount") marks the imported rows as
// fixed-price — never volume-discounted.
//
// A field is a code when it looks like one (≥ 6 characters, at least one digit, only
// letters / digits / . _ - /), a price when it looks like an amount (82 · 82.50 ·
// 82,50 · € 1.299,00 — optionally labelled "RRP 129.90" / "Partner 82.50"); anything
// else on the line is the tag, and a tag / price applies to every code on its line.
// Unlabelled prices are positional: the first is the partner price (net, excl. VAT —
// what customers order at), the second the RRP (gross, VAT included). A line with a
// tab splits on tabs only, else on semicolons, else on commas — so a decimal comma
// works in tab- or semicolon-separated text (and in every spreadsheet cell). Several
// codes on one line (space / comma separated, as before) still work. Duplicate codes
// collapse; a later tag / price for the same code wins.

export type SkuEntry = {
  code: string;
  tag: string | null;
  // Imported prices override whatever the catalogue / Metakocka resolve to.
  partnerPrice?: number | null;
  rrp?: number | null;
  fixedPrice?: boolean; // true = never tier-discounted (absent = leave the row as resolved)
};

export const SKU_CODE_RE = /^(?=.*\d)[A-Za-z0-9][A-Za-z0-9._\-/]{5,}$/;
const HEADER_RE = /\b(sku|ean|code|barcode)\b/i;
export const TAG_MAX = 24;

export function isSkuCode(v: string): boolean {
  return SKU_CODE_RE.test(v.trim());
}

// ── Prices ──
const CURRENCY_RE = /€|\$|£|\b(?:eur|usd|gbp|chf)\b/gi;
const RRP_LABEL_RE = /^(?:rrp|retail|msrp|gross|mpc)\b\s*[:=]?\s*/i;
const PARTNER_LABEL_RE = /^(?:partner|net|wholesale|price|vpc)\b(?:\s*price)?\s*[:=]?\s*/i;

// An amount → number (2 decimals), else null. Up to 5 integer digits without a
// thousands separator, so a 6+ digit number stays a code (EANs never read as prices).
export function parsePrice(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) / 100 : null;
  const t = String(raw ?? "").replace(CURRENCY_RE, "").replace(/\s+/g, "");
  let n: string | null = null;
  if (/^\d{1,5}(?:[.,]\d{1,2})?$/.test(t)) n = t.replace(",", ".");
  else if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(t)) n = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(t)) n = t.replace(/,/g, "");
  if (n == null) return null;
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

// A field that is a price, with the column it belongs to when labelled.
function priceField(f: string): { value: number; kind: "rrp" | "partner" | null } | null {
  if (RRP_LABEL_RE.test(f)) {
    const value = parsePrice(f.replace(RRP_LABEL_RE, ""));
    return value == null ? null : { value, kind: "rrp" };
  }
  if (PARTNER_LABEL_RE.test(f)) {
    const value = parsePrice(f.replace(PARTNER_LABEL_RE, ""));
    return value == null ? null : { value, kind: "partner" };
  }
  const value = parsePrice(f);
  return value == null ? null : { value, kind: null };
}

const FIXED_FIELD_RE = /^(?:fixed(?:[\s-]*price)?|no[\s-]*discount)$/i;
// A spreadsheet cell saying "yes" in the Fixed price column.
export function isTruthyFlag(v: string): boolean {
  return /^(?:x|✓|✔|y|yes|da|ja|true|1|fixed(?:[\s-]*price)?|no[\s-]*discount)$/i.test(v.trim());
}

function splitFields(line: string): string[] {
  const sep = line.includes("\t") ? /\t+/ : line.includes(";") ? /;+/ : /,+/;
  return line.split(sep).map((f) => f.trim()).filter(Boolean);
}

function lineEntries(line: string): SkuEntry[] {
  const fields = splitFields(line);
  const codes: string[] = [];
  const rest: string[] = [];
  let partnerPrice: number | null = null;
  let rrp: number | null = null;
  let fixed = false;
  const unlabelled: number[] = [];
  for (const f of fields) {
    if (FIXED_FIELD_RE.test(f)) {
      fixed = true;
      continue;
    }
    const price = priceField(f);
    if (price) {
      if (price.kind === "rrp") rrp = price.value;
      else if (price.kind === "partner") partnerPrice = price.value;
      else unlabelled.push(price.value);
      continue;
    }
    const tokens = f.split(/[\s,]+/).filter(Boolean);
    // "P1 P2" (several codes) vs "LAST PIECES" (a tag) vs "P1 NEW" (code + tag).
    if (tokens.length > 0 && tokens.every(isSkuCode)) codes.push(...tokens);
    else if (tokens.length > 1 && isSkuCode(tokens[0]) && fields.length === 1) {
      codes.push(tokens[0]);
      rest.push(tokens.slice(1).join(" "));
    } else rest.push(f);
  }
  // Unlabelled amounts fill the columns in order: partner price, then RRP.
  for (const v of unlabelled) {
    if (partnerPrice == null) partnerPrice = v;
    else if (rrp == null) rrp = v;
  }
  const tag = rest.join(" ").trim().slice(0, TAG_MAX) || null;
  return codes.map((code) => withPrices({ code, tag }, partnerPrice, rrp, fixed));
}

function withPrices(
  e: SkuEntry,
  partnerPrice: number | null | undefined,
  rrp: number | null | undefined,
  fixedPrice?: boolean,
): SkuEntry {
  const out: SkuEntry = { code: e.code, tag: e.tag };
  if (partnerPrice != null) out.partnerPrice = partnerPrice;
  if (rrp != null) out.rrp = rrp;
  if (fixedPrice) out.fixedPrice = true;
  return out;
}

// Later values for the same code win; absent ones keep what came before.
export function mergeSkuEntry(prev: SkuEntry | undefined, e: SkuEntry): SkuEntry {
  return withPrices(
    { code: e.code, tag: e.tag ?? prev?.tag ?? null },
    e.partnerPrice ?? prev?.partnerPrice,
    e.rrp ?? prev?.rrp,
    e.fixedPrice || prev?.fixedPrice,
  );
}

export function parseSkuEntries(raw: string): SkuEntry[] {
  const byCode = new Map<string, SkuEntry>();
  const lines = raw.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const entries = lineEntries(line);
    // A header names the columns ("SKU / EAN, Tag") and carries no code.
    if (entries.length === 0 && HEADER_RE.test(line) && i < 3) return;
    for (const e of entries) byCode.set(e.code, mergeSkuEntry(byCode.get(e.code), e));
  });
  return Array.from(byCode.values());
}

function fmtPrice(v: number): string {
  return v.toFixed(2);
}

// Back to the text box form (one "code<TAB>tag<TAB>partner<TAB>RRP x<TAB>FIXED" per line), so
// what is about to be imported is always visible and editable. The RRP is labelled so
// it never reads as a partner price when the partner price is absent.
export function formatSkuEntries(entries: SkuEntry[]): string {
  return entries
    .map((e) =>
      [
        e.code,
        e.tag ?? "",
        e.partnerPrice != null ? fmtPrice(e.partnerPrice) : "",
        e.rrp != null ? `RRP ${fmtPrice(e.rrp)}` : "",
        e.fixedPrice ? "FIXED" : "",
      ]
        .join("\t")
        .replace(/\t+$/, ""),
    )
    .join("\n");
}

// Lookup key for matching resolved rows back to the requested code: codes compare
// case-insensitively, EANs with leading zeros dropped (a spreadsheet eats them).
export function skuKey(v: string | null | undefined): string | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? t.replace(/^0+/, "") : t.toUpperCase();
}
