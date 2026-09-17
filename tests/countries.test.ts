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
  it("returns null for garbage / empty", () => {
    expect(countryIsoFromName("")).toBeNull();
    expect(countryIsoFromName(undefined)).toBeNull();
    expect(countryIsoFromName("Narnia")).toBeNull();
  });
});

describe("countryIsoFromPartner", () => {
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
