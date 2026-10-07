// lib/xlsx-load.ts — open an uploaded .xlsx with ExcelJS, whatever wrote it.
//
// ExcelJS reads only unprefixed SpreadsheetML (`<worksheet>`, `<row>`, `<c>`).
// Files re-saved by the Open XML SDK, ClosedXML, some web viewers and phone apps
// carry every element under an `x:` (or other) prefix bound to the same
// namespace — valid XML that ExcelJS silently turns into an empty workbook and
// then throws on (`Cannot read properties of undefined (reading 'sheets')`).
// So the zip is opened first and every part whose root element is prefixed is
// rewritten without the prefix before ExcelJS sees it.
import "server-only";
import ExcelJS from "exceljs";
import JSZip from "jszip";

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

// `<x:sheetData>` → `<sheetData>`, `</x:c>` → `</c>`, `xmlns:x="…main"` → `xmlns="…main"`.
function stripPrefix(xml: string, prefix: string): string {
  const p = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return xml
    .replace(new RegExp(`<(/?)${p}:`, "g"), "<$1")
    .replace(new RegExp(`\\sxmlns:${p}="${MAIN_NS}"`, "g"), ` xmlns="${MAIN_NS}"`);
}

// The prefix the main namespace is bound to in this part, if any.
function mainPrefix(xml: string): string | null {
  const m = xml.match(/xmlns:([A-Za-z_][\w.-]*)="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main"/);
  return m ? m[1] : null;
}

export async function normalizeXlsx(data: ArrayBuffer | Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(data);
  let touched = false;
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !name.startsWith("xl/") || !name.endsWith(".xml")) continue;
    const xml = await entry.async("string");
    const prefix = mainPrefix(xml);
    if (!prefix) continue;
    zip.file(name, stripPrefix(xml, prefix));
    touched = true;
  }
  if (!touched) return Buffer.isBuffer(data) ? data : Buffer.from(data);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function loadXlsx(data: ArrayBuffer | Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await normalizeXlsx(data)) as never);
  return wb;
}
