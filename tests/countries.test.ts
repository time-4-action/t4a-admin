import { describe, expect, it } from "vitest";
import { countryIsoFromName, countryIsoFromPartner, countryName } from "@/lib/countries";

describe("countryIsoFromName", () => {
  it("resolves ISO codes, English and Slovenian names", () => {
    expect(countryIsoFromName("SI")).toBe("SI");
    expect(countryIsoFromName("svn")).toBe("SI");
    expect(countryIsoFromName("Slovenia")).toBe("SI");
    expect(countryIsoFromName("Slovenija")).toBe("SI");
    expect(countryIsoFromName("Nemčija")).toBe("DE");
    expect(countryIsoFromName("Nemcija")).toBe("DE");
    expect(countryIsoFromName("Avstrija")).toBe("AT");
    expect(countryIsoFromName("Švica")).toBe("CH");
    expect(countryIsoFromName("Deutschland")).toBe("DE");
    expect(countryIsoFromName("Velika Britanija")).toBe("GB");
    expect(countryIsoFromName("ZDA")).toBe("US");
  });
  it("maps regions and islands MK registers use to their parent state", () => {
    expect(countryIsoFromName("Kanarski otoki")).toBe("ES");
    expect(countryIsoFromName("Canary Islands")).toBe("ES");
    expect(countryIsoFromName("Madeira")).toBe("PT");
    expect(countryIsoFromName("Korzika")).toBe("FR");
    expect(countryIsoFromName("Severna Irska")).toBe("GB");
  });
  it("knows Metakocka's Slovenian formal register names", () => {
    expect(countryIsoFromName("Koreja, Republika")).toBe("KR");
    expect(countryIsoFromName("Ruska federacija")).toBe("RU");
    expect(countryIsoFromName("Nizozemski Antili")).toBe("CW");
    expect(countryIsoFromName("Iran, Islamska republika")).toBe("IR");
    expect(countryIsoFromName("Tajvan, provinca Kitajske")).toBe("TW");
    expect(countryIsoFromName("Češka republika")).toBe("CZ");
  });
  it("sees through decorated register names", () => {
    expect(countryIsoFromName("Združeno kraljestvo (UK)")).toBe("GB");
    expect(countryIsoFromName("Deutschland / Germany")).toBe("DE");
    expect(countryIsoFromName("Slovenia - EU")).toBe("SI");
    expect(countryIsoFromName("Italija (IT)")).toBe("IT");
    expect(countryIsoFromName("(Narnia)")).toBeNull();
  });
  it("returns null for garbage / empty", () => {
    expect(countryIsoFromName("")).toBeNull();
    expect(countryIsoFromName(undefined)).toBeNull();
    expect(countryIsoFromName("Narnia")).toBeNull();
  });
});

describe("countryIsoFromPartner", () => {
  it("resolves a decorated register name on the address", () => {
    expect(countryIsoFromPartner({ address: { country: "Združeno kraljestvo (UK)" }, foreignCountry: true })).toEqual({ iso: "GB", source: "mk" });
  });
  it("uses the billing address country", () => {
    expect(countryIsoFromPartner({ address: { country: "Hrvaška" }, foreignCountry: true })).toEqual({ iso: "HR", source: "mk" });
  });
  it("falls back to the home country for domestic partners without a country", () => {
    expect(countryIsoFromPartner({ address: {}, foreignCountry: false })).toEqual({ iso: "SI", source: "home-fallback" });
    expect(countryIsoFromPartner({ address: {}, foreignCountry: true })).toEqual({ iso: null, source: null });
    expect(countryIsoFromPartner({ address: {} })).toEqual({ iso: null, source: null });
  });
});

describe("countryName", () => {
  it("gives English names", () => {
    expect(countryName("SI")).toBe("Slovenia");
    expect(countryName("XK")).toBe("Kosovo");
    expect(countryName(null)).toBe("");
  });
});
