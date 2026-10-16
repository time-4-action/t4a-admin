// Requested delivery date: one parser for everything a person can put in the field.
// A pasted date can reach <input type="date"> as junk (a 6-digit year like
// "151120-11-15", which stores fine but Metakocka rejects as an invalid date), or
// arrive as text in a local format. Anything that isn't a real calendar date in a
// sane year range is treated as "no date" rather than saved and sent to MK.

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function ymd(y: number, m: number, d: number): string | null {
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // 31.02. etc.
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// "2026-11-15", "2026-11-15T00:00:00.000Z", "15.11.2026", "15. 11. 2026", "15/11/2026",
// "15-11-2026" → "2026-11-15"; anything else → null. Day-first, as in Europe.
export function parseDeliveryDate(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : ymd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})\.?$/);
  if (m) return ymd(+m[3], +m[2], +m[1]);
  return null;
}

// The ISO timestamp stored on terms.deliveryDate (UTC midnight), or null.
export function deliveryDateIso(v: unknown): string | null {
  const d = parseDeliveryDate(v);
  return d ? `${d}T00:00:00.000Z` : null;
}

// Metakocka's dd.mm.yyyy form (the one it accepts on put_document), or undefined.
export function mkDeliveryDeadline(v: unknown): string | undefined {
  const d = parseDeliveryDate(v);
  if (!d) return undefined;
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}
