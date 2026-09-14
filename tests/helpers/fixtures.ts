// Shared campaign fixtures for the preorder tests.
import type { PreorderCampaignAdmin, PreorderRow, PreorderTab } from "@/types/preorder";

export function row(id: string, partnerPrice: number, extra: Partial<PreorderRow> = {}): PreorderRow {
  return {
    id,
    source: "catalogue",
    code: `SKU-${id}`,
    name: `Product ${id}`,
    rrp: partnerPrice * 2,
    partnerPrice,
    discountedPrice: null,
    order: 0,
    taxCode: "EX4",
    ...extra,
  };
}

// Two tabs: "Sails" (rows s1, s2, restricted s3) with a ladder, "Masts" (m1) without.
export function baseCampaign(over: Partial<PreorderCampaignAdmin> = {}): PreorderCampaignAdmin {
  const tabs: PreorderTab[] = [
    {
      id: "tab-sails",
      name: "Sails",
      order: 0,
      tiers: [
        { id: "t1", name: "Silver", minAmount: 1000, discountPct: 5 },
        { id: "t2", name: "Gold", minAmount: 5000, discountPct: 10 },
      ],
      groups: [
        {
          id: "grp-a",
          name: "Sail A",
          order: 0,
          rows: [row("s1", 100), row("s2", 200, { discountedPrice: 150 })],
        },
        {
          id: "grp-b",
          name: "Sail B",
          order: 1,
          rows: [row("s3", 300, { restricted: true })],
        },
      ],
    },
    {
      id: "tab-masts",
      name: "Masts",
      order: 1,
      tiers: [],
      groups: [{ id: "grp-m", name: "Mast", order: 0, rows: [row("m1", 50)] }],
    },
  ];
  return {
    id: "c1",
    title: "Season 27",
    season: "SS27",
    currency: "EUR",
    status: "open",
    deadline: "2027-01-31T00:00:00.000Z",
    rrpPricelist: "RRP",
    partnerPricelist: "Partner",
    tabs,
    markets: [],
    customerRules: [],
    priceBooks: [],
    ...over,
  };
}
