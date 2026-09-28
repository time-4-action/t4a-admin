import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { formatSkuEntries, parseSkuEntries, skuKey } from "@/lib/sku-entries";
import { buildSkuTemplateWorkbook, parseSkuWorkbookEntries } from "@/lib/sku-xlsx";

describe("parseSkuEntries (paste / CSV)", () => {
  it("reads a code with an optional tag after comma, tab or semicolon; skips the header", () => {
    const text = "SKU / EAN, Tag\nP07260003140, NEW\n4262434064904\tSALE\nP07260003145;Last pieces\nP07260003147\n";
    expect(parseSkuEntries(text)).toEqual([
      { code: "P07260003140", tag: "NEW" },
      { code: "4262434064904", tag: "SALE" },
      { code: "P07260003145", tag: "Last pieces" },
      { code: "P07260003147", tag: null },
    ]);
  });

  it("still takes several codes per line, and a space-separated tag", () => {
    expect(parseSkuEntries("P01250001071 P01250001076, 4262434061897")).toEqual([
      { code: "P01250001071", tag: null },
      { code: "P01250001076", tag: null },
      { code: "4262434061897", tag: null },
    ]);
    expect(parseSkuEntries("P01250001071 NEW")).toEqual([{ code: "P01250001071", tag: "NEW" }]);
  });

  it("dedupes codes, a later tag wins; round-trips through the text box format", () => {
    const entries = parseSkuEntries("P01250001071\nP01250001071, SALE");
    expect(entries).toEqual([{ code: "P01250001071", tag: "SALE" }]);
    expect(parseSkuEntries(formatSkuEntries(entries))).toEqual(entries);
  });

  it("skuKey matches EANs without leading zeros and codes case-insensitively", () => {
    expect(skuKey("04262434064904")).toBe(skuKey("4262434064904"));
    expect(skuKey("p0726")).toBe(skuKey("P0726"));
  });
});

describe("parseSkuWorkbookEntries (xlsx)", () => {
  it("reads the template's SKU / EAN + Tag columns", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildSkuTemplateWorkbook()) as never);
    const ws = wb.getWorksheet("SKUs")!;
    ws.addRow(["P07260003140", "NEW"]);
    ws.addRow([4262434064904, "SALE"]);
    ws.addRow(["P07260003145"]);
    const entries = await parseSkuWorkbookEntries(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(entries).toEqual([
      { code: "P07260003140", tag: "NEW" },
      { code: "4262434064904", tag: "SALE" },
      { code: "P07260003145", tag: null },
    ]);
  });

  it("finds the columns by name in any order", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["Tag", "Name", "EAN"]);
    ws.addRow(["LIMITED", "Wing 5", "4262434064911"]);
    const entries = await parseSkuWorkbookEntries(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(entries).toEqual([{ code: "4262434064911", tag: "LIMITED" }]);
  });
});
