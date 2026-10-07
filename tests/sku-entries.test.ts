import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { formatSkuEntries, parsePrice, parseSkuEntries, skuKey } from "@/lib/sku-entries";
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

describe("SKU import prices", () => {
  it("reads partner price then RRP positionally, or labelled, with decimal commas in tab / semicolon text", () => {
    const text = [
      "SKU / EAN, Tag, Partner price, RRP",
      "P07260003140, NEW, 82.50, 129.90",
      "4262434064904\tSALE\t82,50",
      "P07260003145;RRP 1.299,00",
      "P07260003147\tpartner: €70\tRRP 99",
      "P07260003148",
    ].join("\n");
    expect(parseSkuEntries(text)).toEqual([
      { code: "P07260003140", tag: "NEW", partnerPrice: 82.5, rrp: 129.9 },
      { code: "4262434064904", tag: "SALE", partnerPrice: 82.5 },
      { code: "P07260003145", tag: null, rrp: 1299 },
      { code: "P07260003147", tag: null, partnerPrice: 70, rrp: 99 },
      { code: "P07260003148", tag: null },
    ]);
  });

  it("never reads a code as a price", () => {
    expect(parsePrice("4262434064904")).toBeNull();
    expect(parsePrice("123456")).toBeNull();
    expect(parseSkuEntries("P0726000, 12345.67")).toEqual([{ code: "P0726000", tag: null, partnerPrice: 12345.67 }]);
  });

  it("round-trips prices through the text box format; later prices win", () => {
    const entries = parseSkuEntries("P01250001071, 10\nP01250001071, SALE\nP07260003145;RRP 20");
    expect(entries).toEqual([
      { code: "P01250001071", tag: "SALE", partnerPrice: 10 },
      { code: "P07260003145", tag: null, rrp: 20 },
    ]);
    expect(parseSkuEntries(formatSkuEntries(entries))).toEqual(entries);
  });

  it("reads Partner price / RRP columns from the xlsx, numbers or text", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildSkuTemplateWorkbook()) as never);
    const ws = wb.getWorksheet("SKUs")!;
    expect(ws.getRow(1).values).toEqual([undefined, "SKU / EAN", "Tag", "Partner price", "RRP", "Fixed price"]);
    ws.addRow(["P07260003140", "NEW", 82.5, 129.9]);
    ws.addRow([4262434064904, null, "82,50 €"]);
    ws.addRow(["P07260003145"]);
    const entries = await parseSkuWorkbookEntries(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(entries).toEqual([
      { code: "P07260003140", tag: "NEW", partnerPrice: 82.5, rrp: 129.9 },
      { code: "4262434064904", tag: null, partnerPrice: 82.5 },
      { code: "P07260003145", tag: null },
    ]);
  });
});

describe("SKU import fixed-price flag", () => {
  it("reads FIXED / no discount on a pasted line and round-trips it", () => {
    const entries = parseSkuEntries("P07260003140, NEW, 82.50, FIXED\nP07260003145\tno discount\nP07260003147");
    expect(entries).toEqual([
      { code: "P07260003140", tag: "NEW", partnerPrice: 82.5, fixedPrice: true },
      { code: "P07260003145", tag: null, fixedPrice: true },
      { code: "P07260003147", tag: null },
    ]);
    expect(parseSkuEntries(formatSkuEntries(entries))).toEqual(entries);
  });

  it("reads the xlsx Fixed price column (x / yes / TRUE), not as a price", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildSkuTemplateWorkbook()) as never);
    const ws = wb.getWorksheet("SKUs")!;
    expect(ws.getRow(1).values).toEqual([undefined, "SKU / EAN", "Tag", "Partner price", "RRP", "Fixed price"]);
    ws.addRow(["P07260003140", null, 82.5, null, "x"]);
    ws.addRow(["P07260003145", null, null, null, true]);
    ws.addRow(["P07260003147", null, 10, null, ""]);
    const entries = await parseSkuWorkbookEntries(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(entries).toEqual([
      { code: "P07260003140", tag: null, partnerPrice: 82.5, fixedPrice: true },
      { code: "P07260003145", tag: null, fixedPrice: true },
      { code: "P07260003147", tag: null, partnerPrice: 10 },
    ]);
  });
});
