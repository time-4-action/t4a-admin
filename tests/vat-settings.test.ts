import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongo, stopMongo, clearMongo } from "./helpers/mongo";
import { getVatSettings, saveVatSettings } from "@/lib/vat-settings";

beforeAll(startMongo);
afterAll(stopMongo);
beforeEach(clearMongo);

describe("global VAT settings", () => {
  it("reads as empty (nothing configured) until saved", async () => {
    expect(await getVatSettings()).toEqual({ rates: {}, fallbackRate: null, taxCodes: [], updatedAt: null, updatedBy: null });
  });

  it("saves any country, normalizes codes/rates and drops invalid entries", async () => {
    const v = await saveVatSettings({ rates: { si: 22, AT: "20", JP: 10, XX: 150, "": 5, DE: "abc" }, fallbackRate: "19.5", taxCodes: [{ rate: "22", code: " EX4 " }, { rate: 0, code: "000" }, { rate: 200, code: "X" }, { rate: 5, code: "" }] }, "admin@t4a.test");
    expect(v.rates).toEqual({ SI: 22, AT: 20, JP: 10 });
    expect(v.taxCodes).toEqual([{ rate: 0, code: "000" }, { rate: 22, code: "EX4" }]);
    expect(v.fallbackRate).toBe(19.5);
    expect(v.updatedBy).toBe("admin@t4a.test");
    expect(v.updatedAt).toBeTruthy();
    expect(await getVatSettings()).toEqual(v);
  });

  it("PUT semantics: a later save replaces the whole table", async () => {
    await saveVatSettings({ rates: { SI: 22, AT: 20 }, fallbackRate: 20 }, null);
    const v = await saveVatSettings({ rates: { SI: 22 }, fallbackRate: null }, null);
    expect(v.rates).toEqual({ SI: 22 });
    expect(v.fallbackRate).toBeNull();
  });
});
