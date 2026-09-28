import { describe, expect, it } from "vitest";
import { smartGroup, splitVariantName, withSmartLabels, type SmartGroupDraft } from "@/lib/preorder-smart-group";

const one = (name: string, code = name): SmartGroupDraft => ({
  name,
  parentCode: code,
  images: [],
  rows: [
    {
      source: "catalogue",
      code,
      ean: null,
      name,
      variantLabel: null,
      size: null,
      tag: null,
      rrp: 1,
      partnerPrice: 1,
      discountedPrice: null,
      image: null,
      taxCode: null,
    },
  ],
});

describe("splitVariantName", () => {
  it("splits a trailing size token", () => {
    expect(splitVariantName("T4A QTS-Wave 71")).toEqual({ base: "T4A QTS-Wave", suffix: "71" });
    expect(splitVariantName("Patrik Mast SDM 80 % 490")).toEqual({ base: "Patrik Mast SDM 80 %", suffix: "490" });
    expect(splitVariantName("Harness Pro XL")).toEqual({ base: "Harness Pro", suffix: "XL" });
  });
  it("leaves names without a size token alone", () => {
    expect(splitVariantName("Boardbag")).toBeNull();
    expect(splitVariantName("Fin Screws")).toBeNull();
  });
});

describe("smartGroup", () => {
  it("merges single-row groups sharing a base, sorted by size", () => {
    const out = smartGroup([one("T4A QTS-Wave 82"), one("T4A QTS-Wave 71"), one("T4A QTS-Wave 76"), one("Boardbag")]);
    expect(out.map((g) => g.name)).toEqual(["T4A QTS-Wave", "Boardbag"]);
    expect(out[0].rows.map((r) => r.variantLabel)).toEqual(["71", "76", "82"]);
    expect(out[0].rows.map((r) => r.code)).toEqual(["T4A QTS-Wave 71", "T4A QTS-Wave 76", "T4A QTS-Wave 82"]);
    expect(out[0].parentCode).toBeNull();
  });
  it("keeps a lone product as is unless its base group exists on the tab", () => {
    expect(smartGroup([one("T4A QTS-Wave 99")])[0].name).toBe("T4A QTS-Wave 99");
    const out = smartGroup([one("T4A QTS-Wave 99")], ["t4a qts-wave"]);
    expect(out[0].name).toBe("t4a qts-wave");
    expect(out[0].rows[0].variantLabel).toBe("99");
  });
  it("never touches multi-variant groups", () => {
    const multi: SmartGroupDraft = { ...one("Wing 4"), rows: [...one("Wing 4").rows, ...one("Wing 5").rows] };
    expect(smartGroup([multi, one("Wing 6")])).toEqual([multi, one("Wing 6")]);
  });
});

describe("smartVariantLabels", () => {
  const r = (name: string, variantLabel: string | null = name) => ({ name, variantLabel });
  it("keeps only the part that differs between variants", () => {
    const rows = [r("Patrik Fin PPW Slot 80"), r("Patrik Fin PPW Slot 90"), r("Patrik Fin PPW Slot 100")];
    expect(withSmartLabels(rows).map((x) => x.variantLabel)).toEqual(["80", "90", "100"]);
  });
  it("keeps multi-word differences", () => {
    const rows = [r("Wing 4.0 Red"), r("Wing 4.0 Blue"), r("Wing 5.0 Red")];
    expect(withSmartLabels(rows).map((x) => x.variantLabel)).toEqual(["4.0 Red", "4.0 Blue", "5.0 Red"]);
  });
  it("never rewrites a label an admin typed, and fills empty ones", () => {
    const rows = [r("Kite 9", "nine"), r("Kite 10", null)];
    expect(withSmartLabels(rows).map((x) => x.variantLabel)).toEqual(["nine", "10"]);
  });
  it("a lone variant falls back to its size token; no prefix = untouched", () => {
    expect(withSmartLabels([r("Kite 9")])[0].variantLabel).toBe("9");
    const rows = [r("Boardbag"), r("Pump")];
    expect(withSmartLabels(rows)).toBe(rows);
  });
});
