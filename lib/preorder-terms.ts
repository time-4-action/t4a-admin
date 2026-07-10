import "server-only";

// Prefill a submission's Terms-tab fields from the resolved Metakocka partner. The
// partner may still edit them on the fill form (shipping address, delivery date, etc.).
import type { MkPartner } from "@/types/documents";
import type { PreorderTerms } from "@/types/preorder";

export function defaultTermsFromPartner(partner: MkPartner): PreorderTerms {
  const a = partner.address;
  const addr = a
    ? [a.street, [a.postNumber, a.city].filter(Boolean).join(" "), a.country]
        .filter(Boolean)
        .join(", ")
    : undefined;
  return {
    invoiceAddress: addr,
    shippingAddress: addr,
    country: a?.country,
    phone: partner.phone,
    deliveryDate: null,
    comment: "",
  };
}
