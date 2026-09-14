// An in-memory stand-in for the Metakocka port used by lib/preorder-mk.ts. Records
// every put_document, can fail or "lose" the response after committing, and answers
// buyer_order lookups from what it committed.
import type { MkOrderPort } from "@/lib/preorder-mk";
import type { SalesOrderInput } from "@/lib/metakocka";
import type { DocDetail, MkPartner } from "@/types/documents";

export type FakeMode = "ok" | "fail" | "commit-then-throw" | "lookup-error" | "down";

export class MkFake implements MkOrderPort {
  mode: FakeMode = "ok";
  creates: SalesOrderInput[] = [];
  orders = new Map<string, DocDetail>(); // mkId → order
  private seq = 1;
  partnerById: MkPartner = {
    mkId: "p1",
    name: "Surf Shop X",
    emails: ["shop@example.com"],
    address: { street: "Cesta 1", postNumber: "1000", city: "Ljubljana", country: "Slovenija" },
    businessEntity: true,
    foreignCountry: false,
  };

  private commit(input: SalesOrderInput): DocDetail {
    const mkId = `mk${this.seq++}`;
    const order: DocDetail = {
      kind: "order",
      docType: "sales_order",
      mkId,
      countCode: `PP-${mkId}`,
      docDate: "2026-09-14",
      currency: input.currencyCode,
      sumAll: String(input.lines.reduce((a, l) => a + l.amount * l.priceWithTax, 0).toFixed(2)),
      statusDesc: "created",
      buyerOrder: input.buyerOrder,
      lines: input.lines.map((l) => ({ code: l.code, name: l.code, amount: String(l.amount), priceWithTax: String(l.priceWithTax), tax: l.tax })),
      links: [],
    };
    this.orders.set(mkId, order);
    return order;
  }

  // Simulate staff editing the order in MK.
  setLine(mkId: string, code: string, amount: number) {
    const o = this.orders.get(mkId);
    if (!o) throw new Error("no order");
    const line = o.lines.find((l) => l.code === code);
    if (line) line.amount = String(amount);
    else o.lines.push({ code, name: code, amount: String(amount), priceWithTax: "1" });
    o.sumAll = String(o.lines.reduce((a, l) => a + Number(l.amount) * Number(l.priceWithTax ?? 0), 0).toFixed(2));
  }

  create: MkOrderPort["create"] = async (input) => {
    if (this.mode === "down") return { ok: false, error: "metakocka unreachable: fetch failed", status: 502 };
    this.creates.push(input);
    if (this.mode === "fail") return { ok: false, error: "metakocka: opr_code 1 (bad product)", status: 422 };
    const order = this.commit(input);
    if (this.mode === "commit-then-throw") {
      this.mode = "ok"; // MK committed; our side saw a timeout
      return { ok: false, error: "metakocka unreachable: aborted", status: 502 };
    }
    return { ok: true, order: { mkId: order.mkId, countCode: order.countCode, totalPrice: order.sumAll } };
  };

  getByBuyerOrder: MkOrderPort["getByBuyerOrder"] = async (buyerOrder) => {
    if (this.mode === "lookup-error" || this.mode === "down") return { status: "error", error: "metakocka unreachable" };
    for (const o of this.orders.values()) if (o.buyerOrder === buyerOrder) return { status: "ok", order: o };
    return { status: "not-found" };
  };

  get: MkOrderPort["get"] = async (mkId) => {
    if (this.mode === "down") return "error";
    return this.orders.get(mkId) ?? null;
  };

  delete: MkOrderPort["delete"] = async (mkId) => {
    if (this.mode === "down") return { ok: false, error: "down", status: 502 };
    this.orders.delete(mkId);
    return { ok: true };
  };

  partner: MkOrderPort["partner"] = async () => this.partnerById;

  taxCodes: MkOrderPort["taxCodes"] = async (codes) => Object.fromEntries(codes.map((c) => [c, "EX4"]));
}
