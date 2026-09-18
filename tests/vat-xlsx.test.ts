import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildVatWorkbook, parseVatWorkbook } from "@/lib/vat-xlsx";

const countries = { SI: "Slovenia", AT: "Austria", DE: "Germany", HR: "Croatia" };

describe("VAT rates spreadsheet", () => {
  it("round-trips: the template carries every country and the current rates, and imports back unchanged", async () => {
    const buf = await buildVatWorkbook(countries, { SI: 22, AT: 20 }, null);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const ws = wb.getWorksheet("VAT rates")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Country", "Code", "VAT %"]);
    expect(ws.rowCount).toBe(1 + Object.keys(countries).length);
    // Configured countries first, then the rest alphabetically.
    expect([2, 3, 4, 5].map((n) => ws.getRow(n).getCell(2).value)).toEqual(["AT", "SI", "HR", "DE"]);

    const parsed = await parseVatWorkbook(buf, countries);
    expect(parsed.rates).toEqual({ SI: 22, AT: 20 });
    expect(parsed.cleared.sort()).toEqual(["DE", "HR"]);
    expect(parsed.skipped).toEqual([]);
  });

  it("accepts a hand-made sheet: header names, '%' suffixes, decimal commas, name-only rows; reports what it skipped", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["Country name", "ISO code", "VAT rate"]);
    ws.addRow(["Slovenia", "si", "22%"]);
    ws.addRow(["Croatia", "", "25"]); // matched by name
    ws.addRow(["Austria", "AT", "9,5"]);
    ws.addRow(["Germany", "DE", "abc"]); // invalid rate → skipped
    ws.addRow(["Atlantis", "XX", 5]); // unknown → skipped
    ws.addRow(["", "", ""]); // blank → ignored
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const parsed = await parseVatWorkbook(buf, countries);
    expect(parsed.rates).toEqual({ SI: 22, HR: 25, AT: 9.5 });
    expect(parsed.cleared).toEqual([]);
    expect(parsed.skipped.map((s) => s.row)).toEqual([5, 6]);
    expect(parsed.skipped[0].reason).toContain("Germany");
    expect(parsed.skipped[1].reason).toContain("XX");
  });
});

describe("xlsx files with a namespace prefix", () => {
  it("reads a workbook re-saved with `x:`-prefixed SpreadsheetML (ExcelJS alone throws on it)", async () => {
    const { readFileSync } = await import("node:fs");
    const buf = readFileSync(new URL("./fixtures/vat-rates-x-prefixed.xlsx", import.meta.url));
    await expect(new ExcelJS.Workbook().xlsx.load(buf as never)).rejects.toThrow();
    const parsed = await parseVatWorkbook(buf, { SI: "Slovenia", AT: "Austria", DE: "Germany", HR: "Croatia" });
    expect(parsed.skipped.filter((s) => !s.reason.startsWith("unknown"))).toEqual([]);
    expect(Object.keys(parsed.rates).length + parsed.cleared.length).toBeGreaterThan(0);
  });
});
