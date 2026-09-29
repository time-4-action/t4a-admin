import { describe, expect, it } from "vitest";
import { autoLabels, refreshTabs, type ProductRefreshInfo } from "@/lib/preorder-refresh";
import type { PreorderGroup, PreorderRow, PreorderTab } from "@/types/preorder";

const row = (id: string, code: string, name: string, extra: Partial<PreorderRow> = {}): PreorderRow => ({
  id,
  source: "catalogue",
  code,
  ean: null,
  name,
  variantLabel: null,
  order: 0,
  rrp: 10,
  partnerPrice: 5,
  ...extra,
});
const group = (id: string, name: string, rows: PreorderRow[], extra: Partial<PreorderGroup> = {}): PreorderGroup => ({
  id,
  name,
  order: 0,
  rows,
  ...extra,
});
const tab = (groups: PreorderGroup[]): PreorderTab => ({ id: "t", name: "Tab", order: 0, groups });
const info = (code: string, name: string, ean: string | null = null, image: string | null = null): ProductRefreshInfo => ({
  code,
  name,
  ean,
  image,
  groupImages: [],
});

describe("autoLabels", () => {
  it("strips the shared prefix and the dash", () => {
    expect(autoLabels(["LISA lines MONO - red", "LISA lines MONO- blue"])).toEqual(["red", "blue"]);
    expect(autoLabels(["Kite 9"])).toEqual([null]);
  });
});

describe("refreshTabs", () => {
  it("replaces a stale SKU with Metakocka's, keeps prices / tags / ids, renames the lone group", () => {
    const stale = row("r1", "P16260002104", "Patrik LISA harness lines wingfoil MONO", {
      ean: "4262434063914",
      tag: "NEW",
      fixedPrice: true,
      partnerPrice: 32.5,
    });
    const { tabs, summary } = refreshTabs([tab([group("g1", "Patrik LISA harness lines wingfoil MONO", [stale])])], {
      P16260002104: info("L12260002104", "LISA harness lines wingfoil MONO - blue", "4262434063914"),
    });
    const g = tabs[0].groups[0];
    expect(g.id).toBe("g1");
    expect(g.name).toBe("LISA harness lines wingfoil MONO - blue");
    expect(g.rows[0]).toMatchObject({ id: "r1", code: "L12260002104", tag: "NEW", fixedPrice: true, partnerPrice: 32.5 });
    expect(summary).toMatchObject({ skus: 1, names: 1, eans: 0 });
  });

  it("merges single-product colour groups into one, first group's id kept, labels by colour", () => {
    const names = ["transparent", "red", "black"].map((c) => `LISA Harness Lines Windsurf Freeride - ${c}`);
    const groups = names.map((n, i) => group(`g${i}`, n, [row(`r${i}`, `L${i}`, n)]));
    const { tabs, summary } = refreshTabs([tab(groups)], Object.fromEntries(names.map((n, i) => [`L${i}`, info(`L${i}`, n)])));
    expect(tabs[0].groups).toHaveLength(1);
    const g = tabs[0].groups[0];
    expect(g).toMatchObject({ id: "g0", name: "LISA Harness Lines Windsurf Freeride" });
    expect(g.rows.map((r) => [r.id, r.variantLabel, r.order])).toEqual([
      ["r0", "transparent", 0],
      ["r1", "red", 1],
      ["r2", "black", 2],
    ]);
    expect(summary.merged).toBe(2);
  });

  it("keeps typed labels and uploaded images; unknown codes and manual rows untouched", () => {
    const uploaded = "https://cdn.x/uploads/media/preorder/c/1.webp";
    const rows = [
      row("a", "A", "Wing 4", { variantLabel: "four", image: uploaded }),
      row("b", "B", "Wing 5", { variantLabel: "Wing 5" }),
      row("c", "GONE", "Old thing"),
      row("m", "", "Manual", { source: "manual" }),
    ];
    const { tabs } = refreshTabs(
      [tab([group("g", "Wing", rows)])],
      { A: info("A", "Wing 4.0", null, "https://cat/a.jpg"), B: info("B", "Wing 5.0", null, "https://cat/b.jpg") },
      ["GONE"],
    );
    const out = tabs[0].groups[0].rows;
    expect(out[0]).toMatchObject({ name: "Wing 4.0", variantLabel: "four", image: uploaded });
    expect(out[1]).toMatchObject({ name: "Wing 5.0", image: "https://cat/b.jpg" });
    expect(out[2]).toEqual({ ...rows[2], order: 2 });
    expect(out[3]).toEqual({ ...rows[3], order: 3 });
  });
});
