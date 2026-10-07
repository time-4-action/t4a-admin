// lib/sku-xlsx.ts — the "Import SKUs" spreadsheet (Preorder → Sheet → Import SKUs).
//
// Column A "SKU / EAN" (one code per row), column B "Tag" (optional — NEW, SALE, …,
// put on the imported variant), columns C "Partner price" (net, excl. VAT) and D "RRP"
// (gross, VAT included) — both optional, overriding the price the code resolves to —
// and E "Fixed price" (optional: x / yes marks the variant as never volume-discounted).
// The template download is that empty layout plus a sheet explaining it. When the
// first row names a code column (SKU / EAN / code / barcode) the import reads that
// column, plus the Tag / price columns it finds by name — in any order. Without such a header every non-empty cell of the first sheet is scanned
// for codes (so an arbitrary stock export still works) and no tags are read. The
// dialog puts the result in its text box and resolves it like pasted text.
import "server-only";
import ExcelJS from "exceljs";
import { PLATFORM_NAME } from "@/lib/brand";
import { loadXlsx } from "@/lib/xlsx-load";
import { isTruthyFlag, mergeSkuEntry, parsePrice, SKU_CODE_RE, TAG_MAX, type SkuEntry } from "@/lib/sku-entries";

export const SKU_XLSX_FILENAME = "preorder-skus.xlsx";
const HEADER = "SKU / EAN";
const TAG_HEADER = "Tag";
const HEADER_RE = /\b(sku|ean|code|barcode)\b/i;
const TAG_HEADER_RE = /^\s*(tag|label|badge)\b/i;
const PARTNER_HEADER = "Partner price";
const RRP_HEADER = "RRP";
const FIXED_HEADER = "Fixed price";
const FIXED_HEADER_RE = /\b(fixed|no[\s-]*discount)\b/i;
const RRP_HEADER_RE = /\b(rrp|retail|msrp|gross|mpc)\b/i;
const PARTNER_HEADER_RE = /\b(partner|net|wholesale|price|vpc)\b/i;
// What a SKU / EAN looks like — at least 6 characters, at least one digit, only
// letters / digits / the separators codes carry. Keeps product names and
// quantities from a stock export (or the "How to fill" sheet) out of the list.
const CODE_RE = SKU_CODE_RE;

export async function buildSkuTemplateWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = PLATFORM_NAME;
  const ws = wb.addWorksheet("SKUs", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: HEADER, key: "code", width: 28 },
    { header: TAG_HEADER, key: "tag", width: 18 },
    { header: PARTNER_HEADER, key: "partnerPrice", width: 16 },
    { header: RRP_HEADER, key: "rrp", width: 14 },
    { header: FIXED_HEADER, key: "fixed", width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  // Codes are text — a bare EAN must not be turned into 4.26243E+12.
  ws.getColumn("code").numFmt = "@";
  ws.getColumn("code").alignment = { horizontal: "left" };
  ws.getColumn("partnerPrice").numFmt = "0.00";
  ws.getColumn("rrp").numFmt = "0.00";

  const notes = wb.addWorksheet("How to fill");
  notes.getColumn(1).width = 100;
  [
    "Put one SKU or EAN per row in column A (\"SKU / EAN\") of the 'SKUs' sheet, under the header.",
    "Column B (\"Tag\") is optional: a short label such as NEW, SALE or LIMITED, shown as a pill on that variant. Leave it empty for no tag.",
    "Column C (\"Partner price\") is optional: the net price excl. VAT that customers order at. Column D (\"RRP\") is optional: the gross retail price incl. VAT (reference only). A price here replaces the one from the catalogue / Metakocka price list; leave it empty to keep that price.",
    "Column E (\"Fixed price\") is optional: put x (or yes) to make that variant a fixed price — volume discounts never apply to it, though it still counts towards the discount thresholds. Customers see a \"Fixed price\" badge.",
    "Note: Re-price on the Sheet page reloads prices from the price lists and overwrites imported prices.",
    "Keep the header row — the import finds the columns by their names (SKU / EAN, Tag, Partner price, RRP, Fixed price), so their order does not matter.",
    "A SKU is the product / variant code (e.g. P01250001071); an EAN is the barcode (e.g. 4262434061897).",
    "A parent product's code imports all its variants, and its tag and prices go on each of them.",
    "Every code resolves against the catalogue (then Metakocka) and is added to the sheet under its parent product.",
    "Import the file on Preorder → Sheet → Import SKUs. Codes that do not resolve are listed after the import.",
  ].forEach((t) => notes.addRow([t]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if (v instanceof Date) return "";
    return "";
  }
  // A numeric EAN cell comes back as a number — never in exponent form here.
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : "";
  return String(v);
}

// A price cell: a number as is (decimals included), text as an amount ("82,50 €").
function priceCell(v: ExcelJS.CellValue): number | null {
  if (v == null) return null;
  if (typeof v === "number") return parsePrice(v);
  if (typeof v === "object" && "result" in v) return priceCell(v.result as ExcelJS.CellValue);
  return parsePrice(cellText(v));
}

// Every code in the workbook with its tag, de-duplicated, in reading order.
export async function parseSkuWorkbookEntries(data: ArrayBuffer | Buffer): Promise<SkuEntry[]> {
  const wb = await loadXlsx(data);
  const ws = wb.worksheets.find((w) => w.name.toLowerCase().includes("sku")) ?? wb.worksheets[0];
  if (!ws) return [];

  // A header row that names the code column → read the columns by name.
  let codeCol = 0;
  let tagCol = 0;
  let partnerCol = 0;
  let rrpCol = 0;
  let fixedCol = 0;
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const t = cellText(cell.value);
    if (!codeCol && HEADER_RE.test(t)) codeCol = col;
    else if (!tagCol && TAG_HEADER_RE.test(t)) tagCol = col;
    // Before the price columns: "Fixed price" names a flag, not a price.
    else if (!fixedCol && FIXED_HEADER_RE.test(t)) fixedCol = col;
    else if (!rrpCol && RRP_HEADER_RE.test(t)) rrpCol = col;
    else if (!partnerCol && PARTNER_HEADER_RE.test(t)) partnerCol = col;
  });
  if (codeCol) {
    const out = new Map<string, SkuEntry>();
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const tag = tagCol ? cellText(row.getCell(tagCol).value).trim().slice(0, TAG_MAX) || null : null;
      const partnerPrice = partnerCol ? priceCell(row.getCell(partnerCol).value) : null;
      const rrp = rrpCol ? priceCell(row.getCell(rrpCol).value) : null;
      const fixedRaw = fixedCol ? row.getCell(fixedCol).value : null;
      const fixed = fixedRaw === true || (fixedRaw != null && isTruthyFlag(cellText(fixedRaw)));
      for (const code of cellText(row.getCell(codeCol).value).split(/[\s,;]+/)) {
        const c = code.trim();
        if (!CODE_RE.test(c)) continue;
        const e: SkuEntry = { code: c, tag };
        if (partnerPrice != null) e.partnerPrice = partnerPrice;
        if (rrp != null) e.rrp = rrp;
        if (fixed) e.fixedPrice = true;
        out.set(c, mergeSkuEntry(out.get(c), e));
      }
    });
    return Array.from(out.values());
  }
  return scanCodes(ws).map((code) => ({ code, tag: null }));
}

// Codes only.
export async function parseSkuWorkbook(data: ArrayBuffer | Buffer): Promise<string[]> {
  return (await parseSkuWorkbookEntries(data)).map((e) => e.code);
}

// No header naming the columns: every cell that looks like a code.
function scanCodes(ws: ExcelJS.Worksheet): string[] {
  const codes = new Set<string>();
  ws.eachRow((row, rowNumber) => {
    const texts: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell) => texts.push(cellText(cell.value)));
    if (rowNumber === 1 && texts.some((t) => HEADER_RE.test(t))) return;
    for (const t of texts) {
      for (const code of t.split(/[\s,;]+/)) {
        const c = code.trim();
        if (CODE_RE.test(c)) codes.add(c);
      }
    }
  });
  return Array.from(codes);
}
