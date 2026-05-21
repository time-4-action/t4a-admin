// Mirrors patrik-warranty-form/src/types/warranty-settings.ts.
// Keep in sync by hand — changes here should also land in the warranty repo.

// ----------------------------------------------------------------------------
// Workflow pipeline
// ----------------------------------------------------------------------------

export type WarrantyStatus =
  | "open"
  | "in_review"
  | "decided"
  | "to_send_new_product"
  | "finished";

export const WARRANTY_STATUSES: WarrantyStatus[] = [
  "open",
  "in_review",
  "decided",
  "to_send_new_product",
  "finished",
];

export const WARRANTY_STATUS_LABELS: Record<WarrantyStatus, string> = {
  open: "Open",
  in_review: "In review",
  decided: "Decided",
  to_send_new_product: "To send new product",
  finished: "Finished",
};

export type WarrantyType =
  | "open"
  | "potential"
  | "proven"
  | "proven_iq"
  | "goodwill"
  | "denied";

export const WARRANTY_TYPES: WarrantyType[] = [
  "open",
  "potential",
  "proven",
  "proven_iq",
  "goodwill",
  "denied",
];

export const WARRANTY_TYPE_LABELS: Record<WarrantyType, string> = {
  open: "Open",
  potential: "Potential",
  proven: "Proven",
  proven_iq: "Proven IQ",
  goodwill: "Goodwill",
  denied: "Rejected",
};

export type WarrantySuggestion =
  | "pending"
  | "accepted"
  | "declined"
  | "denied"
  | "exchange"
  | "exchange_sent"
  | "rcn"
  | "fcn_rcn_to_client_done"
  | "fcn_rcn_to_customer_done"
  | "repair_cost"
  | "repair_cost_rcn";

export const WARRANTY_SUGGESTIONS: WarrantySuggestion[] = [
  "pending",
  "accepted",
  "declined",
  "denied",
  "exchange",
  "exchange_sent",
  "rcn",
  "fcn_rcn_to_client_done",
  "fcn_rcn_to_customer_done",
  "repair_cost",
  "repair_cost_rcn",
];

export const WARRANTY_SUGGESTION_LABELS: Record<WarrantySuggestion, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  denied: "Rejected",
  exchange: "Exchange",
  exchange_sent: "Exchange sent",
  rcn: "RCN",
  fcn_rcn_to_client_done: "FCN / RCN to Client done",
  fcn_rcn_to_customer_done: "FCN / RCN to Customer done",
  repair_cost: "Repair cost",
  repair_cost_rcn: "Repair cost + RCN",
};

export type FactoryStatus =
  | "not_needed"
  | "send_info_to_factory"
  | "info_to_factory_sent"
  | "pending"
  | "requested"
  | "rcn_fcn_in_process"
  | "rcn_fcn_received"
  | "egi_claim"
  | "done"
  | "denied";

export const FACTORY_STATUSES: FactoryStatus[] = [
  "not_needed",
  "send_info_to_factory",
  "info_to_factory_sent",
  "pending",
  "requested",
  "rcn_fcn_in_process",
  "rcn_fcn_received",
  "egi_claim",
  "done",
  "denied",
];

export const FACTORY_STATUS_LABELS: Record<FactoryStatus, string> = {
  not_needed: "Not needed",
  send_info_to_factory: "Send info to factory",
  info_to_factory_sent: "Info to factory sent",
  pending: "Pending",
  requested: "Requested",
  rcn_fcn_in_process: "RCN / FCN in process",
  rcn_fcn_received: "RCN / FCN received",
  egi_claim: "EGI claim",
  done: "Done",
  denied: "Rejected",
};

export type CustomerStatus =
  | "not_needed"
  | "email_sent_to_client"
  | "email_sent_to_customer"
  | "product_returned"
  | "warranty_repaired"
  | "warranty_returned"
  | "warranty_sold"
  | "warranty_destroyed"
  | "buy_warranty"
  | "sell_warranty"
  | "return_warranty"
  | "destroy_warranty"
  | "done";

export const CUSTOMER_STATUSES: CustomerStatus[] = [
  "not_needed",
  "email_sent_to_client",
  "email_sent_to_customer",
  "product_returned",
  "warranty_repaired",
  "warranty_returned",
  "warranty_sold",
  "warranty_destroyed",
  "buy_warranty",
  "sell_warranty",
  "return_warranty",
  "destroy_warranty",
  "done",
];

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  not_needed: "Not needed",
  email_sent_to_client: "Email sent to client",
  email_sent_to_customer: "Email sent to customer",
  product_returned: "Product returned",
  warranty_repaired: "Warranty repaired",
  warranty_returned: "Warranty returned",
  warranty_sold: "Warranty sold",
  warranty_destroyed: "Warranty destroyed",
  buy_warranty: "Buy warranty",
  sell_warranty: "Sell warranty",
  return_warranty: "Return warranty",
  destroy_warranty: "Destroy warranty",
  done: "Done",
};

export const ASSIGNEES = [
  "Tine",
  "Patrik",
  "Henning",
  "Karin",
  "Alex",
  "Nejc",
  "Zala",
] as const;
export type Assignee = (typeof ASSIGNEES)[number];

export type ClaimNote = {
  id: string;
  authorName: string;
  authorEmail: string;
  text: string;
  createdAt: string;
};

// ----------------------------------------------------------------------------
// Email field catalogues (unchanged from v1)
// ----------------------------------------------------------------------------

export type CustomerFieldKey =
  | "claimNumber"
  | "productName"
  | "serialNumber"
  | "submittedAt";

export type AdminFieldKey =
  | "submissionId"
  | "submittedAt"
  | "name"
  | "company"
  | "email"
  | "phone"
  | "typeOfPartner"
  | "address"
  | "countryOfPurchase"
  | "invoiceNumber"
  | "invoiceIssuedBy"
  | "dateOfPurchase"
  | "sku"
  | "ean"
  | "productName"
  | "productCategory"
  | "serialNumber"
  | "dateOfFailure"
  | "daysOfUse"
  | "problemDescription"
  | "dataPolicyAccepted"
  | "uploads";

export const CUSTOMER_FIELD_KEYS: CustomerFieldKey[] = [
  "claimNumber",
  "productName",
  "serialNumber",
  "submittedAt",
];

export const ADMIN_FIELD_KEYS: AdminFieldKey[] = [
  "submissionId",
  "submittedAt",
  "name",
  "company",
  "email",
  "phone",
  "typeOfPartner",
  "address",
  "countryOfPurchase",
  "invoiceNumber",
  "invoiceIssuedBy",
  "dateOfPurchase",
  "sku",
  "ean",
  "productName",
  "productCategory",
  "serialNumber",
  "dateOfFailure",
  "daysOfUse",
  "problemDescription",
  "dataPolicyAccepted",
  "uploads",
];

export const CUSTOMER_FIELD_LABELS: Record<CustomerFieldKey, string> = {
  claimNumber: "Claim number",
  productName: "Product",
  serialNumber: "Serial number",
  submittedAt: "Submitted",
};

export const ADMIN_FIELD_LABELS: Record<AdminFieldKey, string> = {
  submissionId: "Submission ID",
  submittedAt: "Submitted",
  name: "Name",
  company: "Company",
  email: "Email",
  phone: "Phone",
  typeOfPartner: "Type of partner",
  address: "Address",
  countryOfPurchase: "Country of purchase",
  invoiceNumber: "Invoice number",
  invoiceIssuedBy: "Invoice issued by",
  dateOfPurchase: "Date of purchase",
  sku: "SKU",
  ean: "EAN",
  productName: "Product name",
  productCategory: "Product category",
  serialNumber: "Serial number",
  dateOfFailure: "Date of failure",
  daysOfUse: "Approx. days of use",
  problemDescription: "Problem description",
  dataPolicyAccepted: "Data policy accepted",
  uploads: "Uploaded files (section)",
};

export type CustomerEmailSettings = {
  subject: string;
  intro: string;
  outro: string;
  fields: CustomerFieldKey[];
};

export type AdminEmailSettings = {
  subject: string;
  intro: string;
  fields: AdminFieldKey[];
};

export type WarrantySettings = {
  adminRecipients: string[];
  customer: CustomerEmailSettings;
  admin: AdminEmailSettings;
};

// ----------------------------------------------------------------------------
// Claim document
// ----------------------------------------------------------------------------

export type WarrantyFileUrls = {
  invoice: string;
  serial: string;
  full: string;
  closeup: string;
};

export type WarrantySubmission = {
  submissionId: string;
  name: string;
  surname: string;
  company: string;
  email: string;
  phone: string;
  typeOfPartner: string;
  address: string;
  invoiceNumber: string;
  invoiceIssuedBy: string;
  dateOfPurchase: string;
  countryOfPurchase: string;
  sku: string;
  ean: string;
  productName: string;
  productCategory: string;
  serialNumber: string;
  dateOfFailure: string;
  daysOfUse: string;
  problemDescription: string;
  fileUrls: WarrantyFileUrls;
  dataPolicyAccepted: boolean;
  submittedAt: string;
  // Workflow
  status: WarrantyStatus;
  statusUpdatedAt?: string;
  workflowUpdatedAt?: string;
  assignee: Assignee | null;
  warrantyType: WarrantyType | null;
  suggestion: WarrantySuggestion | null;
  factoryStatus: FactoryStatus | null;
  customerStatus: CustomerStatus | null;
  notes: ClaimNote[];
};

export type ListWarrantyResult = {
  total: number;
  items: WarrantySubmission[];
};
