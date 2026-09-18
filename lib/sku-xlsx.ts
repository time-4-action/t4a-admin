// lib/sku-xlsx.ts — the "Import SKUs" spreadsheet (Preorder → Sheet → Import SKUs).
//
// One column of SKU / EAN codes, one code per row. The template download is that
// empty layout plus a sheet explaining it; the import reads every non-empty cell
// of the first sheet (so a file with several columns, or several codes in one
// cell, still works), skips a header row, and hands the codes back to the dialog —
// which resolves them against the catalogue exactly like pasted text.
import "server-only";
import ExcelJS from "exceljs";
import { loadXlsx } from "@/lib/xlsx-load";

export const SKU_XLSX_FILENAME = "preorder-skus.xlsx";
const HEADER = "SKU / EAN";
const HEADER_RE = /\b(sku|ean|code|barcode)\b/i;
// What a SKU / EAN looks like — at least 6 characters, at least one digit, only
// letters / digits / the separators codes carry. Keeps product names and
// quantities from a stock export (or the "How to fill" sheet) out of the list.
const CODE_RE = /^(?=.*\d)[A-Za-z0-9][A-Za-z0-9._\-\/]{5,}$/;

export async function buildSkuTemplateWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "T4A Admin";
  const ws = wb.addWorksheet("SKUs", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [{ header: HEADER, key: "code", width: 28 }];
  ws.getRow(1).font = { bold: true };
  // Codes are text — a bare EAN must not be turned into 4.26243E+12.
  ws.getColumn("code").numFmt = "@";
  ws.getColumn("code").alignment = { horizontal: "left" };

  const notes = wb.addWorksheet("How to fill");
  notes.getColumn(1).width = 90;
  [
    "Put one SKU or EAN per row in column A of the 'SKUs' sheet, under the header.",
    "A SKU is the product / variant code (e.g. P01250001071); an EAN is the barcode (e.g. 4262434061897).",
    "Every code resolves against the catalogue and is added to the sheet under its parent product.",
    "Extra columns are read too, so a stock export with a code column somewhere will import as well.",
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

// Every code in the workbook, de-duplicated, in reading order.
export async function parseSkuWorkbook(data: ArrayBuffer | Buffer): Promise<string[]> {
  const wb = await loadXlsx(data);
  const ws = wb.worksheets.find((w) => w.name.toLowerCase().includes("sku")) ?? wb.worksheets[0];
  if (!ws) return [];
  const codes = new Set<string>();
  ws.eachRow((row, rowNumber) => {
    const texts: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell) => texts.push(cellText(cell.value)));
    // A header row is one whose cells name the column rather than carry a code.
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
