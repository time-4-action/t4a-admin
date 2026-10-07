import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildSkuTemplateWorkbook, parseSkuWorkbook } from "@/lib/sku-xlsx";

describe("Import SKUs spreadsheet", () => {
  it("the template is empty apart from its header and round-trips filled rows", async () => {
    const template = await buildSkuTemplateWorkbook();
    expect(await parseSkuWorkbook(template)).toEqual([]);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(template as never);
    const ws = wb.getWorksheet("SKUs")!;
    ws.addRow(["P01250001071"]);
    ws.addRow([4262434061897]); // a numeric EAN cell
    ws.addRow(["P01250001076, 4262434061897"]); // several codes in one cell, one duplicate
    ws.addRow([""]);
    const filled = Buffer.from(await wb.xlsx.writeBuffer());
    expect(await parseSkuWorkbook(filled)).toEqual(["P01250001071", "4262434061897", "P01250001076"]);
  });

  it("reads an arbitrary export: first sheet, any column, header row skipped", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Stock");
    ws.addRow(["Name", "Barcode", "Qty"]);
    ws.addRow(["Foil Mast 85", "4262434061897", 3]);
    ws.addRow(["Foil Mast 95", "4262434061898", 0]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const codes = await parseSkuWorkbook(buf);
    expect(codes).toContain("4262434061897");
    expect(codes).toContain("4262434061898");
    expect(codes).not.toContain("Barcode");
    // Names and quantities are not codes.
    expect(codes).toEqual(["4262434061897", "4262434061898"]);
  });
});
