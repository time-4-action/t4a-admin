// types/documents.ts
//
// Shared shapes for the Metakocka document surface (B2B portal + admin browse).
// These are hand-written, normalized views over the raw Metakocka REST responses
// (which return every value as a string). The mapping from raw MK JSON lives in
// lib/metakocka.ts — keep the two in sync by hand, like types/warranty.ts.

// The customer-facing document families. Each maps to one or more raw
// Metakocka `doc_type`s (see DOC_TYPES in lib/metakocka.ts). A credit note
// ("dobropis", MK `sales_bill_credit_note`) is a bill that refunds / offsets an
// invoice, so it shares the invoice's bill-shaped fields (due date, payment).
export type DocKind = "offer" | "order" | "invoice" | "credit-note";

// The bill-shaped families: carry a due date, paid amount and payment state.
export const BILL_KINDS: readonly DocKind[] = ["invoice", "credit-note"];

export function isBillKind(kind: DocKind | null | undefined): boolean {
  return !!kind && BILL_KINDS.includes(kind);
}

// Payment state derived from sum_paid vs sum_all (bills only — invoices and
// credit notes; on a credit note "paid" means the refund has been settled).
export type PaymentState = "paid" | "partial" | "unpaid" | "overdue" | "na";

// The partner embedded in a document (`partner{…}` / `receiver{…}` in MK). The
// address fields are the postal address MK printed on the document: `partner`
// is the billing party, `receiver` (when present) the delivery address.
export type MkPartnerRef = {
  mkId: string;
  countCode?: string;
  name?: string;
  taxId?: string;
  street?: string;
  postNumber?: string;
  city?: string;
  country?: string;
  countryIso?: string; // ISO-2 (country_iso_2)
  email?: string;
  phone?: string;
};

export type MkContact = { email?: string; phone?: string; address?: string };
export type MkAddress = {
  type?: string;
  street?: string;
  postNumber?: string;
  city?: string;
  country?: string;
  paymentDueDays?: string;
  currency?: string;
  language?: string;
};

// A partner resolved from /get_partner (used for email→partner mapping, the
// admin partner picker, the customer header, and the full customer profile).
export type MkPartner = {
  mkId: string;
  countCode?: string;
  name: string;
  taxId?: string;
  emails: string[];
  phone?: string;
  city?: string;
  address?: { street?: string; postNumber?: string; city?: string; country?: string };
  paymentDueDays?: string;
  currency?: string;
  language?: string;
  businessEntity?: boolean;
  taxpayer?: boolean;
  // MK's foreign_county flag: false ⇒ a domestic partner (used as the home-country
  // fallback when the address carries no country — see lib/countries.ts).
  foreignCountry?: boolean;
  contacts?: MkContact[];
  addresses?: MkAddress[];
};

// A sales price list defined in Metakocka (a "cenik"). MK has no endpoint that
// lists price lists on their own; they are collected from products' pricelist[]
// arrays (json/product_list with return_pricelist). `title` is the human name the
// catalogue also syncs onto ProductPrice.name; `code` is MK's sales_pricelist_code.
export type MkPricelist = {
  code: string;
  title: string;
  currency?: string;
};

// One product's price in one Metakocka price list, read straight from MK
// (json/product_list return_pricelist). `price` is price_def.price; `discount`
// is the list's percentage off it; `effective` is the price after that discount —
// the number to actually show/charge. The catalogue's flat {name,price} can't
// carry `discount`, so tiered lists (PP GOLD, etc.) must be read from MK.
export type MkProductPrice = {
  listCode: string; // the price list's count_code
  title: string; // the price list's name (matches campaign rrp/partnerPricelist)
  price: number; // base list price as MK stores it (price_def.price, or price_def.price_with_tax backed out to net)
  priceWithTax?: number; // price_def.price_with_tax when the list is defined gross
  discount?: number; // percentage off, if any
  effective: number; // NET price after discount — the number to charge a company
  currency?: string;
  tax?: string; // MK tax code (e.g. "EX4") from price_def.tax, when present
  taxRate?: number; // VAT % from price_def.tax_desc / tax_factor (e.g. 22), when present
  // Whether this list is priced NET (a tax was declared → add VAT for the gross
  // price). Lists without a tax are already gross (consumer/RRP prices).
  net: boolean;
};

// The result of creating a Metakocka sales order via put_document.
export type MkSalesOrderResult = {
  mkId: string;
  countCode: string;
  totalPrice?: string;
};

export type DocLine = {
  // A descriptive / text line (MK "Add text to document" / "Add a descriptive
  // line") rather than a real product — no product id, price or quantity. Its
  // text is carried in `name`. Render as a section header, not a priced row.
  isText?: boolean;
  code?: string;
  name?: string;
  amount?: string;
  unit?: string;
  price?: string; // net unit price
  priceWithTax?: string; // gross unit price
  tax?: string;
  discount?: string; // line discount %
  // Sales orders only: quantity already shipped against this line, summed from
  // the order's linked warehouse packing lists (MK carries no per-line shipped
  // figure on the order itself). Undefined on other kinds.
  shipped?: string;
};

export type DocLink = {
  mkId: string;
  countCode: string;
  docType: string;
};

// One row in a document list.
export type DocSummary = {
  kind: DocKind;
  docType: string; // raw MK doc_type
  mkId: string;
  countCode: string;
  docDate: string | null; // yyyy-mm-dd
  title?: string;
  currency?: string;
  sumAll?: string;
  statusCode?: string;
  statusDesc?: string;
  itemCount?: number; // number of real product lines (excludes text lines)
  // bills only (invoices, credit notes)
  dueDate?: string | null;
  payment?: PaymentState;
  sumPaid?: string; // amount paid so far (bills)
  // sales orders: MK `buyer_order` (the customer's order number — for preorders, our
  // idempotency marker) and the free-form extra columns.
  buyerOrder?: string;
  extraColumns?: { name: string; value: string }[];
  // Portal agents only: which of their accounts the document belongs to (set by
  // /api/portal/documents when the user has more than one account).
  account?: { mkId: string; name: string; own: boolean };
};

// Full document detail.
export type DocDetail = DocSummary & {
  partner?: MkPartnerRef; // billing party + address
  receiver?: MkPartnerRef; // delivery address, when it differs from `partner`
  deliveryType?: string; // MK delivery_type (carrier / method), when set
  notes?: string;
  sumBasic?: string;
  sumDiscount?: string;
  sumTax?: string;
  sumPaid?: string;
  lastPaidDate?: string | null;
  validTo?: string | null; // offers
  lines: DocLine[];
  links: DocLink[];
};

// Metadata used by the UI to label each family.
export const DOC_KIND_LABELS: Record<DocKind, { singular: string; plural: string }> = {
  offer: { singular: "Offer", plural: "Offers" },
  order: { singular: "Order", plural: "Orders" },
  invoice: { singular: "Invoice", plural: "Invoices" },
  "credit-note": { singular: "Credit note", plural: "Credit notes" },
};

// The URL segment for a family's list page (`/portal/<slug>`, `/documents/<slug>`).
export const DOC_KIND_SLUGS: Record<DocKind, string> = {
  offer: "offers",
  order: "orders",
  invoice: "invoices",
  "credit-note": "credit-notes",
};

// Parse a URL/query value into a DocKind (accepts singular or plural).
export function parseDocKind(v?: string | null): DocKind | null {
  switch ((v ?? "").toLowerCase()) {
    case "offer":
    case "offers":
      return "offer";
    case "order":
    case "orders":
      return "order";
    case "invoice":
    case "invoices":
      return "invoice";
    case "credit-note":
    case "credit-notes":
    case "credit_note":
    case "creditnote":
    case "creditnotes":
      return "credit-note";
    default:
      return null;
  }
}
