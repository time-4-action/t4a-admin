// lib/vat-xlsx.ts — the VAT rate table as a spreadsheet (Preorder → VAT rates).
//
// One sheet, three columns: Country · Code · VAT %. The template download is the
// current table (every country, the configured rate or blank), so it doubles as an
// export; the same layout comes back through the import. Import semantics: a row
// names a country (by ISO code, else by name) and SETS its rate — a blank VAT cell
// clears it; countries absent from the file are left untouched. Nothing is saved
// here: the parsed rates go back to the page, which merges and autosaves them.
import "server-only";
import ExcelJS from "exceljs";
import { PLATFORM_NAME } from "@/lib/brand";
import { loadXlsx } from "@/lib/xlsx-load";
import { normalizeVatRate, type VatRateMap } from "@/lib/pricing";

export const VAT_XLSX_FILENAME = "vat-rates.xlsx";
const HEADERS = ["Country", "Code", "VAT %"] as const;

export async function buildVatWorkbook(countries: Record<string, string>, rates: VatRateMap, fallbackRate: number | null): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = PLATFORM_NAME;
  const ws = wb.addWorksheet("VAT rates", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: HEADERS[0], key: "country", width: 34 },
    { header: HEADERS[1], key: "code", width: 10 },
    { header: HEADERS[2], key: "vat", width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = "A1:C1";
  const list = Object.entries(countries)
    .map(([iso, name]) => ({ iso, name }))
    .sort((a, b) => {
      const sa = rates[a.iso] != null ? 0 : 1;
      const sb = rates[b.iso] != null ? 0 : 1;
      return sa - sb || a.name.localeCompare(b.name);
    });
  for (const c of list) {
    const row = ws.addRow({ country: c.name, code: c.iso, vat: rates[c.iso] ?? null });
    row.getCell("vat").numFmt = "0.##";
    row.getCell("vat").alignment = { horizontal: "right" };
  }
  // A second sheet spells the rules out so the file explains itself when forwarded.
  const notes = wb.addWorksheet("How to fill");
  notes.getColumn(1).width = 90;
  [
    "Fill the VAT % column on the 'VAT rates' sheet — a number like 22 or 9.5 (no % sign needed).",
    "Countries are matched by the two-letter Code; the Country name is only a fallback when the code is missing.",
    "A row with an empty VAT % clears that country's rate. Countries you delete from the file are left as they are.",
    `Fallback rate currently configured: ${fallbackRate == null ? "none — individuals in countries without a rate cannot submit" : `${fallbackRate}%`}. It is edited on the page, not in this file.`,
    "Import the file back on Preorder → VAT rates. The rates are merged into the table and saved.",
  ].forEach((t) => notes.addRow([t]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export type VatImportResult = {
  rates: VatRateMap; // iso → rate for every row that set one
  cleared: string[]; // isos whose row carried a blank rate
  skipped: { row: number; reason: string }[];
};

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if (v instanceof Date) return v.toISOString();
    return "";
  }
  return String(v);
}

function rateOf(v: ExcelJS.CellValue): number | null | "invalid" {
  const raw = cellText(v).trim().replace("%", "").replace(",", ".").trim();
  if (raw === "") return null;
  const n = normalizeVatRate(raw);
  return n === null ? "invalid" : n;
}

export async function parseVatWorkbook(data: ArrayBuffer | Buffer, countries: Record<string, string>): Promise<VatImportResult> {
  const wb = await loadXlsx(data);
  const ws = wb.worksheets.find((w) => w.name.toLowerCase().includes("vat")) ?? wb.worksheets[0];
  const out: VatImportResult = { rates: {}, cleared: [], skipped: [] };
  if (!ws) return out;

  const isoSet = new Set(Object.keys(countries));
  const byName = new Map(Object.entries(countries).map(([iso, name]) => [name.trim().toLowerCase(), iso]));

  // Column layout: from a header row that names the columns, else A/B/C as the template.
  let col = { country: 1, code: 2, vat: 3 };
  let firstDataRow = 1;
  const head = ws.getRow(1);
  const headText = (i: number) => cellText(head.getCell(i).value).trim().toLowerCase();
  const headCells = Array.from({ length: Math.max(3, head.cellCount) }, (_, i) => headText(i + 1));
  const codeIdx = headCells.findIndex((t) => t === "code" || t.includes("iso") || t.includes("country code"));
  const vatIdx = headCells.findIndex((t) => t.includes("vat") || t.includes("rate") || t === "%");
  const nameIdx = headCells.findIndex((t) => t === "country" || t.includes("country name") || t === "name");
  if (codeIdx !== -1 || vatIdx !== -1 || nameIdx !== -1) {
    col = { country: nameIdx === -1 ? 1 : nameIdx + 1, code: codeIdx === -1 ? 2 : codeIdx + 1, vat: vatIdx === -1 ? 3 : vatIdx + 1 };
    firstDataRow = 2;
  }

  ws.eachRow((row, n) => {
    if (n < firstDataRow) return;
    const code = cellText(row.getCell(col.code).value).trim().toUpperCase();
    const name = cellText(row.getCell(col.country).value).trim();
    if (!code && !name) return; // blank line
    let iso: string | null = null;
    if (code && isoSet.has(code)) iso = code;
    else if (!code && name) iso = byName.get(name.toLowerCase()) ?? null;
    else if (code && !isoSet.has(code)) {
      // A wrong code with a recognisable name still lands; an unknown code alone is skipped.
      iso = name ? (byName.get(name.toLowerCase()) ?? null) : null;
      if (!iso) {
        out.skipped.push({ row: n, reason: `unknown country code "${code}"` });
        return;
      }
    }
    if (!iso) {
      out.skipped.push({ row: n, reason: `unknown country "${name}"` });
      return;
    }
    const rate = rateOf(row.getCell(col.vat).value);
    if (rate === "invalid") {
      out.skipped.push({ row: n, reason: `${countries[iso]}: "${cellText(row.getCell(col.vat).value).trim()}" is not a VAT rate (0–100)` });
      return;
    }
    if (rate === null) {
      if (!out.cleared.includes(iso)) out.cleared.push(iso);
      delete out.rates[iso];
    } else {
      out.rates[iso] = rate;
      out.cleared = out.cleared.filter((c) => c !== iso);
    }
  });
  return out;
}
