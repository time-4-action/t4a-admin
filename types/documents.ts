// types/documents.ts
//
// Shared shapes for the Metakocka document surface (B2B portal + admin browse).
// These are hand-written, normalized views over the raw Metakocka REST responses
// (which return every value as a string). The mapping from raw MK JSON lives in
// lib/metakocka.ts — keep the two in sync by hand, like types/warranty.ts.

// The three customer-facing document families. Each maps to one or more raw
// Metakocka `doc_type`s (see DOC_TYPES in lib/metakocka.ts).
export type DocKind = "offer" | "order" | "invoice";

// Payment state derived from sum_paid vs sum_all (invoices only).
export type PaymentState = "paid" | "partial" | "unpaid" | "overdue" | "na";

// The partner embedded in a document (`partner{…}` in MK).
export type MkPartnerRef = {
  mkId: string;
  countCode?: string;
  name?: string;
  taxId?: string;
};

// A partner resolved from /get_partner (used for email→partner mapping and the
// admin partner picker).
export type MkPartner = {
  mkId: string;
  countCode?: string;
  name: string;
  taxId?: string;
  emails: string[];
  city?: string;
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
  // invoices only
  dueDate?: string | null;
  payment?: PaymentState;
  sumPaid?: string; // amount paid so far (bills)
};

// Full document detail.
export type DocDetail = DocSummary & {
  partner?: MkPartnerRef;
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
    default:
      return null;
  }
}
