// Mirrors patrik-warranty-form/src/types/warranty-settings.ts and warranty.ts.
// Keep in sync by hand — changes here should also land in the warranty repo.

export type WarrantyStatus =
  | "new"
  | "in_review"
  | "approved"
  | "rejected"
  | "shipped";

export const WARRANTY_STATUSES: WarrantyStatus[] = [
  "new",
  "in_review",
  "approved",
  "rejected",
  "shipped",
];

export const WARRANTY_STATUS_LABELS: Record<WarrantyStatus, string> = {
  new: "New",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  shipped: "Shipped",
};

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
  status: WarrantyStatus;
  statusUpdatedAt?: string;
};

export type ListWarrantyResult = {
  total: number;
  items: WarrantySubmission[];
};
