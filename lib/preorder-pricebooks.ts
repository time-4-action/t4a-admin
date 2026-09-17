import "server-only";

// lib/preorder-pricebooks.ts
//
// Price books: the NET partner prices of a campaign's products in every NON-default
// Metakocka price list that a market or customer rule refers to. Refreshed on an admin
// action (or alongside the builder's Reprice) — never on a portal load — with the same
// bounded MK fan-out as today's Reprice (one json/product_list call per code,
// concurrency 10). Row tax codes are captured by products/resolve + reprice instead.

import { getMkProductPrices, pickMkListNetPrice, productTaxCode, listSalesPricelists } from "@/lib/metakocka";
import { referencedPricelists } from "@/lib/preorder-effective";
import { PreorderCampaign, toCampaignAdminView } from "@/lib/preorder";
import type { IPreorderCampaign } from "@/models/preorder-campaign";
import type { MkProductPrice } from "@/types/documents";

export type PriceBookRefreshResult = {
  pricelist: string;
  entries: number;
  missing: number;
  currency: string | null;
}[];

// Refresh the campaign's price books for the given lists (default: every list referenced
// by its markets / customer rules) and persist them with a targeted $set — the builder
// autosaves `tabs` from client state concurrently, so rows are never written here.
export async function refreshPriceBooks(doc: IPreorderCampaign, pricelists?: string[]): Promise<PriceBookRefreshResult> {
  const admin = toCampaignAdminView(doc);
  const wanted = (pricelists?.length ? pricelists : referencedPricelists(admin)).map((p) => p.trim()).filter(Boolean);

  const codes = Array.from(
    new Set(doc.tabs.flatMap((t) => t.groups.flatMap((g) => g.rows.filter((r) => r.source === "catalogue" && r.code).map((r) => r.code)))),
  );
  if (codes.length === 0) {
    const empty = wanted.map((p) => ({ pricelist: p, currency: null, fetchedAt: new Date(), entries: [], missing: 0 }));
    await PreorderCampaign.updateOne({ _id: doc._id }, { $set: { priceBooks: empty } }).exec();
    doc.priceBooks = empty;
    return empty.map((b) => ({ pricelist: b.pricelist, entries: 0, missing: 0, currency: null }));
  }

  const [mk, known] = await Promise.all([getMkProductPrices(codes), listSalesPricelists().catch(() => [])]);
  const currencyOf = (title: string) => known.find((k) => k.title.trim().toLowerCase() === title.trim().toLowerCase())?.currency ?? null;

  const books = wanted.map((pricelist) => {
    let missing = 0;
    const entries = codes.map((code) => {
      const list: MkProductPrice[] | undefined = mk[code];
      const net = pickMkListNetPrice(list, pricelist);
      if (net == null) missing += 1;
      return { code, net, taxCode: list?.length ? productTaxCode(list) : null };
    });
    const fromEntries = codes.map((c) => mk[c]?.find((e) => e.title.trim().toLowerCase() === pricelist.toLowerCase())?.currency).find(Boolean) ?? null;
    return { pricelist, currency: fromEntries ?? currencyOf(pricelist), fetchedAt: new Date(), entries, missing };
  });

  // Books for lists no longer referenced are dropped — they would go stale silently.
  await PreorderCampaign.updateOne({ _id: doc._id }, { $set: { priceBooks: books } }).exec();
  doc.priceBooks = books;
  return books.map((b) => ({ pricelist: b.pricelist, entries: b.entries.length, missing: b.missing, currency: b.currency }));
}
