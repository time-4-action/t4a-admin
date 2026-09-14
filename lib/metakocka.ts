import "server-only";

// Server-side client for the raw Metakocka REST API
// (https://main.metakocka.si/rest/eshop/v1/*). Every call is a POST whose JSON
// body carries the credentials (secret_key + company_id) — there is NO per-user
// auth, so this MUST stay server-side and the secret must never reach the browser.
//
// This is distinct from lib/mk-api.ts, which talks to the t4a-mk-automation sync
// service (a different system) over x-api-key.
//
// Powers two surfaces:
//   - the B2B customer portal (a user sees only their own documents; the partner
//     is resolved from the session email, never from client input)
//   - the admin "Documents" browse tool (an admin picks any partner)

import sanitizeHtml from "sanitize-html";
import type {
  DocDetail,
  DocKind,
  DocLine,
  DocLink,
  DocSummary,
  MkPartner,
  MkPartnerRef,
  MkPricelist,
  MkProductPrice,
  MkSalesOrderResult,
  PaymentState,
} from "@/types/documents";

const TIMEOUT_MS = 20_000;

function getBase(): string {
  const base = process.env.MK_REST_BASE || "https://main.metakocka.si";
  return base.replace(/\/$/, "");
}

function getSecretKey(): string {
  const key = process.env.MK_SECRET_KEY;
  if (!key) throw new Error("MK_SECRET_KEY not configured");
  return key;
}

function getCompanyId(): string {
  const id = process.env.MK_COMPANY_ID;
  if (!id) throw new Error("MK_COMPANY_ID not configured");
  return id;
}

// The raw MK doc_types behind each customer-facing family. Invoices span both
// domestic and foreign sales bills ("invoices foreign" in the brief).
export const DOC_TYPES: Record<DocKind, string[]> = {
  offer: ["sales_offer"],
  order: ["sales_order"],
  invoice: ["sales_bill_domestic", "sales_bill_foreign"],
};

function kindForDocType(docType: string): DocKind {
  if (docType === "sales_offer") return "offer";
  if (docType === "sales_order") return "order";
  return "invoice";
}

type MkOk = { ok: true; status: number; data: Record<string, unknown> };
type MkErr = { ok: false; status: number; error: string };
export type MkResult = MkOk | MkErr;

// Low-level POST to a Metakocka endpoint. Injects credentials, applies a timeout,
// and interprets the `opr_code` envelope ("0" = success).
export async function callMetakocka(
  endpoint: string,
  body: Record<string, unknown>,
  opts: { timeoutMs?: number } = {},
): Promise<MkResult> {
  const url = `${getBase()}/rest/eshop/v1/${endpoint}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret_key: getSecretKey(),
        company_id: getCompanyId(),
        ...body,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    if (text) {
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return { ok: false, status: res.status, error: `metakocka: non-JSON response` };
      }
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: `metakocka api ${res.status}` };
    }
    // Envelope-level failure (HTTP 200 but opr_code != 0).
    const oprCode = data.opr_code;
    if (oprCode !== undefined && String(oprCode) !== "0") {
      const desc = typeof data.opr_desc === "string" ? data.opr_desc : `opr_code ${oprCode}`;
      return { ok: false, status: 422, error: `metakocka: ${desc}` };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, error: `metakocka unreachable: ${msg}` };
  } finally {
    clearTimeout(t);
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v);
  return s === "" ? undefined : s;
}

// MK dates look like "2015-05-10+02:00" or "2019-12-17T14:28:54+02:00".
function mkDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function num(v: unknown): number | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

// Derive a payment state from sum_paid vs sum_all + due date. Bills are always
// fetched WITH payment flags, so a missing sum_paid means zero paid (MK omits it
// for fully-unpaid invoices) — treat it as 0, not unknown. "na" is only for a
// missing total (a data problem).
function derivePayment(
  sumAll: unknown,
  sumPaid: unknown,
  dueDate: string | null,
): PaymentState {
  const all = num(sumAll);
  if (all === undefined) return "na";
  const paid = num(sumPaid) ?? 0;
  if (paid >= all - 0.005) return "paid";
  if (paid > 0.005) return "partial";
  // Unpaid — overdue if the due date is in the past (date-only compare).
  if (dueDate && dueDate < todayIso()) return "overdue";
  return "unpaid";
}

function todayIso(): string {
  // yyyy-mm-dd in local time; good enough for a due-date comparison.
  return new Date().toISOString().slice(0, 10);
}

function isBill(docType: string): boolean {
  return docType.startsWith("sales_bill");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Metakocka notes arrive as HTML (authored by company staff in the MK UI). Some
// docs carry plain text with newlines instead. Sanitize to a safe formatting
// subset before it reaches the browser; plain text is escaped + nl2br'd first.
function sanitizeNotes(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const looksHtml = /<[a-z][\s\S]*?>/i.test(raw);
  const input = looksHtml ? raw : escapeHtml(raw).replace(/\r?\n/g, "<br>");
  const clean = sanitizeHtml(input, {
    allowedTags: [
      "p", "br", "b", "strong", "i", "em", "u", "s", "span", "div",
      "ul", "ol", "li", "a", "h3", "h4", "h5", "h6", "blockquote", "hr",
      "table", "thead", "tbody", "tr", "th", "td",
    ],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  }).trim();
  return clean || undefined;
}

// ── partner resolution ───────────────────────────────────────────────────────

function mapPartner(raw: Record<string, unknown>): MkPartner {
  return mapPartnerRawImpl(raw);
}

// Exported for the customer directory sync (lib/mk-customers.ts).
export function mapPartnerRaw(raw: Record<string, unknown>): MkPartner {
  return mapPartnerRawImpl(raw);
}

function mapPartnerRawImpl(raw: Record<string, unknown>): MkPartner {
  const contacts = Array.isArray(raw.partner_contact_list)
    ? (raw.partner_contact_list as Record<string, unknown>[])
    : [];
  const emails = contacts
    .map((c) => str(c.email))
    .filter((e): e is string => !!e);
  const phone = contacts.map((c) => str(c.gsm)).find(Boolean);
  const addrs = Array.isArray(raw.partner_delivery_address_list)
    ? (raw.partner_delivery_address_list as Record<string, unknown>[])
    : [];
  // Prefer the billing address ("Račun"), else the first one.
  const billing =
    addrs.find((a) => (str(a.address_type) ?? "").toLowerCase().startsWith("ra")) ?? addrs[0];
  const address = billing
    ? {
        street: str(billing.street),
        postNumber: str(billing.post_number),
        city: str(billing.city),
        country: str(billing.country),
      }
    : undefined;
  return {
    mkId: String(raw.mk_id),
    countCode: str(raw.count_code),
    name: str(raw.customer) ?? String(raw.mk_id),
    taxId: str(raw.tax_id_number) ?? str(raw.partner_tax_number),
    emails,
    phone,
    city: address?.city,
    address,
    paymentDueDays: str(billing?.payment_due_days),
    currency: str(billing?.currency),
    language: str(billing?.language),
    businessEntity: raw.business_entity === "true" || raw.business_entity === true,
    taxpayer: raw.taxpayer === undefined ? undefined : raw.taxpayer === "true" || raw.taxpayer === true,
    foreignCountry:
      raw.foreign_county === undefined ? undefined : raw.foreign_county === "true" || raw.foreign_county === true,
    contacts: contacts
      .map((c) => ({ email: str(c.email), phone: str(c.gsm), address: str(c.contact_address) }))
      .filter((c) => c.email || c.phone || c.address),
    addresses: addrs.map((a) => ({
      type: str(a.address_type),
      street: str(a.street),
      postNumber: str(a.post_number),
      city: str(a.city),
      country: str(a.country),
      paymentDueDays: str(a.payment_due_days),
      currency: str(a.currency),
      language: str(a.language),
    })),
  };
}

// Resolve a login email to a single Metakocka partner. Returns null when there
// is no unambiguous match (no partner, or several partners share the email —
// which we treat as "no account" rather than guess).
export async function resolvePartnerByEmail(
  email: string | null | undefined,
): Promise<MkPartner | null> {
  const wanted = email?.trim().toLowerCase();
  if (!wanted) return null;

  const cached = partnerCacheGet(wanted);
  if (cached !== undefined) return cached;

  const res = await callMetakocka("get_partner", { partner_email: email });
  if (!res.ok) {
    // Don't cache transient failures.
    return null;
  }
  const list = Array.isArray(res.data.partner_list)
    ? (res.data.partner_list as Record<string, unknown>[])
    : [];

  // Keep only partners that actually carry the login email on a contact — the MK
  // email search is fuzzy, so we confirm an exact contact match.
  const exact = list
    .map(mapPartner)
    .filter((p) => p.emails.some((e) => e.toLowerCase() === wanted));

  const resolved = exact.length === 1 ? exact[0] : null;
  partnerCacheSet(wanted, resolved);
  return resolved;
}

// Search partners for the admin picker (by free-text name / email / tax). With
// an empty/short query, list some partners (empty partner_name matches all in MK)
// so the picker isn't blank on load. Capped and name-sorted.
const PARTNER_LIST_CAP = 60;
export async function searchPartners(query: string): Promise<MkPartner[]> {
  const q = query.trim();
  // Pick the search field by shape: an @ ⇒ email, a leading letter+digits ⇒ tax,
  // otherwise name. get_partner only accepts one field at a time; an empty
  // partner_name returns every partner.
  const body: Record<string, unknown> =
    q.length < 2
      ? { partner_name: "" }
      : q.includes("@")
        ? { partner_email: q }
        : /^[A-Za-z]{2}\d+$/.test(q)
          ? { partner_tax_number: q }
          : { partner_name: q };
  const res = await callMetakocka("get_partner", body);
  if (!res.ok) return [];
  const list = Array.isArray(res.data.partner_list)
    ? (res.data.partner_list as Record<string, unknown>[])
    : [];
  return list
    .map(mapPartner)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, PARTNER_LIST_CAP);
}

// Fetch a single partner by mk_id (for the admin customer-docs header).
export async function getPartnerById(mkId: string): Promise<MkPartner | null> {
  const res = await callMetakocka("get_partner", { partner_id: mkId });
  if (!res.ok) return null;
  const list = Array.isArray(res.data.partner_list)
    ? (res.data.partner_list as Record<string, unknown>[])
    : [];
  const match = list.map(mapPartner).find((p) => p.mkId === mkId);
  return match ?? list.map(mapPartner)[0] ?? null;
}

// tiny in-process cache (email → partner|null) with a short TTL. Survives across
// requests within a server instance; not shared between instances (fine — it's a
// latency optimization, not a source of truth).
const PARTNER_TTL_MS = 5 * 60 * 1000;
const partnerCache = new Map<string, { at: number; value: MkPartner | null }>();
function partnerCacheGet(email: string): MkPartner | null | undefined {
  const hit = partnerCache.get(email);
  if (!hit) return undefined;
  if (Date.now() - hit.at > PARTNER_TTL_MS) {
    partnerCache.delete(email);
    return undefined;
  }
  return hit.value;
}
function partnerCacheSet(email: string, value: MkPartner | null): void {
  partnerCache.set(email, { at: Date.now(), value });
}

// ── document mapping ─────────────────────────────────────────────────────────

function mapPartnerRef(raw: unknown): MkPartnerRef | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Record<string, unknown>;
  if (!p.mk_id) return undefined;
  const contact =
    p.partner_contact && typeof p.partner_contact === "object"
      ? (p.partner_contact as Record<string, unknown>)
      : undefined;
  return {
    mkId: String(p.mk_id),
    countCode: str(p.count_code),
    name: str(p.customer),
    taxId: str(p.tax_id_number),
    street: str(p.street),
    postNumber: str(p.post_number),
    city: str(p.place),
    country: str(p.country),
    countryIso: str(p.country_iso_2),
    email: str(contact?.email),
    phone: str(contact?.gsm) ?? str(contact?.phone),
  };
}

function mapLines(raw: unknown): DocLine[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((l) => {
    // Text/descriptive lines carry no product id or code — only doc_desc/name_desc.
    const isText = !l.mk_id && !str(l.code);
    const text = str(l.doc_desc) ?? str(l.name_desc);
    return {
      isText,
      code: str(l.code),
      name: str(l.name) ?? text,
      amount: str(l.amount),
      unit: str(l.unit),
      price: str(l.price),
      priceWithTax: str(l.price_with_tax),
      tax: str(l.tax),
      discount: str(l.discount),
    };
  });
}

function mapLinks(raw: unknown): DocLink[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[])
    .filter((d) => d && d.mk_id)
    .map((d) => ({
      mkId: String(d.mk_id),
      countCode: str(d.count_code) ?? "",
      docType: str(d.doc_type) ?? "",
    }));
}

function mapSummary(raw: Record<string, unknown>): DocSummary {
  const docType = String(raw.doc_type ?? "");
  const dueDate = mkDate(raw.duo_payment);
  const bill = isBill(docType);
  const products = Array.isArray(raw.product_list)
    ? (raw.product_list as Record<string, unknown>[]).filter((p) => p && (p.mk_id || str(p.code))).length
    : undefined;
  return {
    kind: kindForDocType(docType),
    docType,
    mkId: String(raw.mk_id),
    countCode: str(raw.count_code) ?? String(raw.mk_id),
    docDate: mkDate(raw.doc_date),
    title: str(raw.title),
    currency: str(raw.currency_code),
    sumAll: str(raw.sum_all),
    statusCode: str(raw.status_code),
    statusDesc: str(raw.status_desc),
    dueDate: bill ? dueDate : undefined,
    payment: bill ? derivePayment(raw.sum_all, raw.sum_paid, dueDate) : undefined,
    sumPaid: bill ? str(raw.sum_paid) : undefined,
    itemCount: products,
    buyerOrder: str(raw.buyer_order),
    extraColumns: Array.isArray(raw.extra_column)
      ? (raw.extra_column as Record<string, unknown>[])
          .map((c) => ({ name: str(c.name) ?? "", value: str(c.value) ?? "" }))
          .filter((c) => c.name)
      : undefined,
  };
}

function mapDetail(raw: Record<string, unknown>): DocDetail {
  return {
    ...mapSummary(raw),
    partner: mapPartnerRef(raw.partner),
    receiver: mapPartnerRef(raw.receiver),
    deliveryType: str(raw.delivery_type),
    // MK has two free-text fields: `notes_header` is "Additional instructions"
    // (customer-facing, printed on the document) and `notes` is "Additional
    // text on document" — used internally, so it is never surfaced here.
    notes: sanitizeNotes(str(raw.notes_header)),
    sumBasic: str(raw.sum_basic),
    sumDiscount: str(raw.sum_discount),
    sumTax: [raw.sum_tax_ex1, raw.sum_tax_ex2, raw.sum_tax_ex3, raw.sum_tax_ex4, raw.sum_tax_085, raw.sum_tax_200]
      .map(num)
      .filter((n): n is number => n !== undefined)
      .reduce((a, b) => a + b, 0)
      .toFixed(2),
    sumPaid: str(raw.sum_paid),
    lastPaidDate: mkDate(raw.last_paid_date),
    validTo: mkDate(raw.valid_to),
    lines: mapLines(raw.product_list),
    links: mapLinks(raw.doc_link_list),
  };
}

// ── document listing / detail ────────────────────────────────────────────────

// MK's /search pages at most this many documents per call.
const SEARCH_PAGE_SIZE = 100;

async function searchDocTypePage(
  docType: string,
  partnerMkId: string,
  offset: number,
): Promise<{ items: DocSummary[]; total: number }> {
  const body: Record<string, unknown> = {
    doc_type: docType,
    result_type: "doc",
    limit: SEARCH_PAGE_SIZE,
    offset,
    query_advance: [{ type: "partner_mk_id", value: partnerMkId }],
  };
  // Ask for payment figures so invoice lists can show paid/unpaid.
  if (isBill(docType)) {
    body.show_last_payment_date = "true";
    body.show_payment_detail = "true";
  }
  const res = await callMetakocka("search", body);
  if (!res.ok) return { items: [], total: 0 };
  const result = Array.isArray(res.data.result)
    ? (res.data.result as Record<string, unknown>[])
    : [];
  return {
    items: result.map(mapSummary),
    total: num(res.data.result_all_records) ?? result.length,
  };
}

// Every document of one doc_type for a partner. The first page tells us the
// total; the remaining pages are fetched in parallel so a customer with a few
// hundred orders still loads in one round trip after the first.
async function searchDocType(
  docType: string,
  partnerMkId: string,
): Promise<{ items: DocSummary[]; total: number }> {
  const first = await searchDocTypePage(docType, partnerMkId, 0);
  const offsets: number[] = [];
  for (let off = SEARCH_PAGE_SIZE; off < first.total; off += SEARCH_PAGE_SIZE) offsets.push(off);
  if (offsets.length === 0) return first;
  const rest = await Promise.all(offsets.map((off) => searchDocTypePage(docType, partnerMkId, off)));
  return { items: [...first.items, ...rest.flatMap((r) => r.items)], total: first.total };
}

// List ALL of a partner's documents for one family — no cap, every page is
// fetched. Invoices merge domestic + foreign; sorted newest-first.
export async function listDocuments(
  kind: DocKind,
  partnerMkId: string,
): Promise<{ items: DocSummary[]; total: number }> {
  const docTypes = DOC_TYPES[kind];
  const results = await Promise.all(
    docTypes.map((dt) => searchDocType(dt, partnerMkId)),
  );
  const items = results
    .flatMap((r) => r.items)
    .sort((a, b) => (b.docDate ?? "").localeCompare(a.docDate ?? ""));
  const total = results.reduce((sum, r) => sum + r.total, 0);
  return { items, total };
}

// Fetch one document's full detail by mk_id. We don't carry the raw doc_type in
// the URL, so for a kind with several doc_types (invoices) we try each until one
// resolves. `payments` adds the paid/installment breakdown (bills only).
export async function getDocument(
  kind: DocKind,
  mkId: string,
): Promise<DocDetail | null> {
  for (const docType of DOC_TYPES[kind]) {
    const body: Record<string, unknown> = { doc_type: docType, doc_id: mkId };
    if (isBill(docType)) {
      body.show_last_payment_date = "true";
      body.show_payment_detail = "true";
    }
    const res = await callMetakocka("get_document", body);
    if (res.ok && res.data.mk_id) {
      const detail = mapDetail(res.data);
      if (kind === "order") detail.lines = await withShippedAmounts(detail);
      return detail;
    }
  }
  return null;
}

// Per-line shipped quantity for a sales order. MK carries no such figure on
// the order itself: its "Shipped" column is the quantity on the order's
// delivery notes ("dobavnice" — doc_type `warehouse_packing_list`; the
// `warehouse_delivery_note` is the picking/shipping *order*, which alone ships
// nothing). Each delivery note is linked from the order's doc_link_list with
// its own product_list. Sum those per product code and hand the totals out to
// the order lines in order (an order can repeat a code, e.g. two SHIPPING
// lines). Verified against MK's own screen on invoiced, part-shipped and
// picking-only orders. Known gap: MK links lines by id, so a product added to
// the delivery note before it was on the order counts here but not in MK —
// the REST API exposes no line-level link. Notes are fetched in parallel; one
// that fails simply contributes nothing.
async function withShippedAmounts(detail: DocDetail): Promise<DocLine[]> {
  // MK's own status is authoritative when it is unambiguous: "shipped" and
  // "invoiced" both mean every line has left the warehouse.
  const status = (detail.statusDesc ?? "").toLowerCase();
  if (status === "shipped" || status === "invoiced") {
    return detail.lines.map((l) => (l.isText ? l : { ...l, shipped: l.amount ?? "0" }));
  }
  const notes = detail.links.filter((l) => l.docType === "warehouse_packing_list");
  if (notes.length === 0) return detail.lines.map((l) => (l.isText ? l : { ...l, shipped: "0" }));

  const results = await Promise.all(
    notes.map((n) => callMetakocka("get_document", { doc_type: n.docType, doc_id: n.mkId })),
  );
  const shippedByCode = new Map<string, number>();
  for (const res of results) {
    if (!res.ok) continue;
    for (const line of mapLines(res.data.product_list)) {
      if (line.isText || !line.code) continue;
      const qty = num(line.amount) ?? 0;
      shippedByCode.set(line.code, (shippedByCode.get(line.code) ?? 0) + qty);
    }
  }

  return detail.lines.map((l) => {
    if (l.isText || !l.code) return l;
    const ordered = num(l.amount) ?? 0;
    const remaining = shippedByCode.get(l.code) ?? 0;
    const take = Math.min(ordered, remaining);
    shippedByCode.set(l.code, remaining - take);
    return { ...l, shipped: formatQty(take) };
  });
}

// Quantities come back from MK as strings like "3" or "1.5" — keep the same
// shape when we compute one ourselves (no trailing ".0").
function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

// ── PDF (report) ─────────────────────────────────────────────────────────────

function reportIdForKind(kind: DocKind): string | undefined {
  // 38 (bill) and 37 (offer) are Metakocka's standard report templates and are
  // verified working on this account; both are env-overridable. Orders have no
  // reliable standard report, so order PDF is opt-in via MK_REPORT_ID_ORDER.
  if (kind === "invoice") return process.env.MK_REPORT_ID_INVOICE || "38";
  if (kind === "offer") return process.env.MK_REPORT_ID_OFFER || "37";
  return process.env.MK_REPORT_ID_ORDER || undefined;
}

export function pdfSupported(kind: DocKind): boolean {
  return !!reportIdForKind(kind);
}

// Parameters sent with every /report call. These are the same
// `ADD_ATT_HIDDEN_*` attributes Metakocka's own report generator uses (dump one
// with `&dump_for_report_rest=true` on any report URL in the web app). Without
// the two image flags the REST endpoint renders the bare template — no company
// logo and no letterhead — even though the web app shows both, because the
// REST path does not inherit the company's print defaults.
//
//   ADD_ATT_HIDDEN_SHOW_LOGOTIP_IMAGE     — the company logo configured in MK
//   ADD_ATT_HIDDEN_SHOW_BACKGROUND_IMAGE  — the company letterhead / memorandum
//   ADD_ATT_HIDDEN_MK_BACKGROUND_IMAGE_ID — optional: pin a specific letterhead
//                                           (MK_REPORT_BACKGROUND_IMAGE_ID)
//   ADD_ATT_HIDDEN_DEFAULT_LOCALE         — optional: force the report language
//                                           (MK_REPORT_LOCALE, e.g. "en"); by
//                                           default MK picks it from the doc.
type ReportParam = { type: string; value: string };

function reportParams(): ReportParam[] {
  const params: ReportParam[] = [
    { type: "REPORT_TYPE", value: "PDF" },
    { type: "ADD_ATT_HIDDEN_SHOW_LOGOTIP_IMAGE", value: "true" },
    { type: "ADD_ATT_HIDDEN_SHOW_BACKGROUND_IMAGE", value: "true" },
  ];
  const backgroundId = process.env.MK_REPORT_BACKGROUND_IMAGE_ID?.trim();
  if (backgroundId) {
    params.push({ type: "ADD_ATT_HIDDEN_MK_BACKGROUND_IMAGE_ID", value: backgroundId });
  }
  const locale = process.env.MK_REPORT_LOCALE?.trim();
  if (locale) {
    params.push({ type: "ADD_ATT_HIDDEN_DEFAULT_LOCALE", value: locale });
  }
  return params;
}

// ── sales price lists ─────────────────────────────────────────────────────────

// MK exposes no "list price lists" endpoint. The closest source of truth is
// json/product_list with return_pricelist: every product carries a pricelist[]
// of the lists it participates in ({ count_code, title, currency_code,
// sales_purchase }). Global lists (RRP, partner) sit on essentially every sales
// product, so a bounded scan surfaces them reliably. Result is cached (lists
// change rarely) and deduped by count_code; purchase-only lists are dropped.
const PRICELIST_SCAN_LIMIT = 120;
const PRICELIST_TTL_MS = 30 * 60 * 1000;
let pricelistCache: { at: number; value: MkPricelist[] } | null = null;

export async function listSalesPricelists(): Promise<MkPricelist[]> {
  if (pricelistCache && Date.now() - pricelistCache.at < PRICELIST_TTL_MS) {
    return pricelistCache.value;
  }
  const res = await callMetakocka("json/product_list", {
    sales: "true",
    return_pricelist: "true",
    limit: String(PRICELIST_SCAN_LIMIT),
  });
  if (!res.ok) return pricelistCache?.value ?? [];

  // product_list is an array (many products) or a single object (when count_code
  // is given) — normalize to an array.
  const raw = res.data.product_list;
  const products = Array.isArray(raw)
    ? (raw as Record<string, unknown>[])
    : raw && typeof raw === "object"
      ? [raw as Record<string, unknown>]
      : [];

  const byCode = new Map<string, MkPricelist>();
  for (const p of products) {
    const pl = Array.isArray(p.pricelist) ? (p.pricelist as Record<string, unknown>[]) : [];
    for (const entry of pl) {
      // Skip purchase-only lists; keep sales (or unspecified, which MK treats as both).
      if (str(entry.sales_purchase) === "purchase") continue;
      const code = str(entry.count_code);
      if (!code || byCode.has(code)) continue;
      byCode.set(code, {
        code,
        title: str(entry.title) ?? code,
        currency: str(entry.currency_code),
      });
    }
  }
  const value = Array.from(byCode.values()).sort((a, b) => a.title.localeCompare(b.title));
  pricelistCache = { at: Date.now(), value };
  return value;
}

// ── per-product prices (read straight from MK) ─────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Metakocka rejects a bare ISO date (yyyy-mm-dd) for doc_date on put_document; it
// accepts the dd.mm.yyyy form (per the API examples). Local-time "today".
function mkDocDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

// Run an async fn over items with bounded concurrency (MK is per-product, so a
// wide sheet would otherwise fire hundreds of parallel calls).
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

// Parse one product's pricelist[] into sales price entries with the effective
// (post-discount) price computed. Purchase-only lists are dropped.
function parseProductPrices(prod: Record<string, unknown>): MkProductPrice[] {
  const pl = Array.isArray(prod.pricelist) ? (prod.pricelist as Record<string, unknown>[]) : [];
  const entries: MkProductPrice[] = [];
  for (const e of pl) {
    if (str(e.sales_purchase) === "purchase") continue;
    const def =
      e.price_def && typeof e.price_def === "object"
        ? (e.price_def as Record<string, unknown>)
        : {};
    const base = num(def.price);
    if (base === undefined) continue;
    const discount = num(def.discount);
    const effective = discount ? round2(base * (1 - discount / 100)) : base;
    const tax = str(def.tax);
    entries.push({
      listCode: str(e.count_code) ?? "",
      title: str(e.title) ?? "",
      price: base,
      discount,
      effective,
      currency: str(e.currency_code),
      tax,
      taxRate: num(def.tax_desc),
      net: !!tax,
    });
  }
  return entries;
}

// Fetch the sales price lists (with effective prices) for a set of product codes,
// straight from MK. One json/product_list call per code (fast — ~8ms each), bounded
// concurrency. Codes that don't resolve are simply absent from the result.
const MK_PRICE_CONCURRENCY = 10;
export async function getMkProductPrices(
  codes: string[],
): Promise<Record<string, MkProductPrice[]>> {
  const unique = Array.from(new Set(codes.map((c) => c.trim()).filter(Boolean)));
  const out: Record<string, MkProductPrice[]> = {};
  await mapLimit(unique, MK_PRICE_CONCURRENCY, async (code) => {
    const res = await callMetakocka("json/product_list", {
      code,
      return_pricelist: "true",
    });
    if (!res.ok) return;
    const raw = res.data.product_list;
    const products = Array.isArray(raw)
      ? (raw as Record<string, unknown>[])
      : raw && typeof raw === "object"
        ? [raw as Record<string, unknown>]
        : [];
    const prod = products.find((p) => str(p.code) === code) ?? products[0];
    if (prod) out[code] = parseProductPrices(prod);
  });
  return out;
}

// Pick the effective (net, post-discount) price for a price-list title from a
// product's price entries. Returns null when the title isn't priced for this product.
export function pickMkListPrice(
  entries: MkProductPrice[] | undefined,
  title: string | null | undefined,
): number | null {
  if (!entries || !title) return null;
  const want = title.trim().toLowerCase();
  const hit = entries.find((e) => e.title.trim().toLowerCase() === want);
  return hit ? hit.effective : null;
}

// The product's VAT rate (%), taken from whichever of its price lists declares a tax;
// falls back to MK_DEFAULT_VAT_RATE / 22 (SI standard). Tier lists (PP GOLD, etc.)
// carry no tax of their own, so we read it from a sibling list on the same product.
export function productVatRate(entries: MkProductPrice[] | undefined): number {
  const fromList = entries?.find((e) => e.taxRate !== undefined)?.taxRate;
  return fromList ?? (Number(process.env.MK_DEFAULT_VAT_RATE) || 22);
}

// Pick a price-list title's GROSS price (discount + VAT included) — the "real" price
// to display and to send as price_with_tax. `untaxedIsNet` decides how to treat a
// list that declares no tax: partner/tier lists are net (add VAT); RRP lists are
// already gross (consumer prices) so use as-is.
export function pickMkListGrossPrice(
  entries: MkProductPrice[] | undefined,
  title: string | null | undefined,
  opts: { untaxedIsNet: boolean },
): number | null {
  if (!entries || !title) return null;
  const want = title.trim().toLowerCase();
  const hit = entries.find((e) => e.title.trim().toLowerCase() === want);
  if (!hit) return null;
  const rate = hit.taxRate ?? productVatRate(entries);
  if (hit.net) return round2(hit.effective * (1 + rate / 100));
  return opts.untaxedIsNet ? round2(hit.effective * (1 + productVatRate(entries) / 100)) : hit.effective;
}

// MK's put_document requires an explicit `tax` code per line (it doesn't fall back
// to the product master for API-created lines). Take it from whichever of the
// product's price lists carries one; else a configurable default (SI standard 22%
// slot is "EX4" on this account).
export function productTaxCode(entries: MkProductPrice[] | undefined): string {
  const fromList = entries?.find((e) => e.tax)?.tax;
  return fromList || process.env.MK_DEFAULT_TAX_CODE || "EX4";
}

// ── sales order creation ───────────────────────────────────────────────────────

const PUT_DOCUMENT_TIMEOUT_MS = 60_000;

export type SalesOrderInput = {
  partner: MkPartner;
  title: string; // becomes the MK sales order title (the campaign season)
  currencyCode: string;
  notes?: string;
  // Idempotency / link marker: MK's `buyer_order` (char 30). MK can look a sales order
  // up by it (get_document, update_document, change_document_status).
  buyerOrder?: string;
  extraColumns?: { name: string; value: string }[];
  changeLogNote?: string; // document_change_log_notes (≤ 50 chars)
  deliveryDeadline?: string; // yyyy-mm-dd
  // Each line references an existing product by code with an EXPLICIT GROSS unit price
  // (priceWithTax = discount + VAT included, retrieved from the partner price list and
  // locked at order time — we don't put a price list on the document) and a tax code
  // (put_document requires tax per line; MK backs out the net/VAT from the gross).
  lines: { code: string; amount: number; priceWithTax: number; tax: string }[];
};

// Create a Metakocka sales order via put_document. Outward-facing + hard to
// reverse — callers gate it behind an explicit admin action.
export async function createSalesOrder(
  input: SalesOrderInput,
): Promise<{ ok: true; order: MkSalesOrderResult } | { ok: false; error: string; status: number }> {
  const { partner, title, currencyCode, notes, lines } = input;
  if (lines.length === 0) return { ok: false, error: "No lines to order", status: 400 };

  const addr = partner.address ?? {};
  const body: Record<string, unknown> = {
    doc_type: "sales_order",
    doc_date: mkDocDate(),
    title,
    currency_code: currencyCode,
    status_code: "created",
    partner: {
      business_entity: partner.businessEntity ? "true" : "false",
      ...(partner.foreignCountry !== undefined ? { foreign_county: partner.foreignCountry ? "true" : "false" } : {}),
      ...(partner.taxpayer !== undefined ? { taxpayer: partner.taxpayer ? "true" : "false" } : {}),
      tax_id_number: partner.taxId ?? "",
      customer: partner.name,
      street: addr.street ?? "",
      post_number: addr.postNumber ?? "",
      place: addr.city ?? partner.city ?? "",
      country: addr.country ?? "",
    },
    // Explicit GROSS price + tax per line (price_with_tax already includes the partner
    // discount and VAT; tax gives MK the rate to back out net). No price list on the doc.
    product_list: lines.map((l) => ({
      code: l.code,
      amount: String(l.amount),
      price_with_tax: String(l.priceWithTax),
      tax: l.tax,
    })),
  };
  if (notes) body.notes = notes;
  if (input.buyerOrder) body.buyer_order = input.buyerOrder.slice(0, 30);
  if (input.extraColumns?.length) body.extra_column = input.extraColumns;
  if (input.changeLogNote) body.document_change_log_notes = input.changeLogNote.slice(0, 50);
  if (input.deliveryDeadline) body.delivery_deadline = input.deliveryDeadline;

  // MK's own examples show put_document taking ~48 s. Aborting early while MK still
  // commits is exactly how orphan orders are born, so this call gets a long budget.
  const res = await callMetakocka("put_document", body, { timeoutMs: PUT_DOCUMENT_TIMEOUT_MS });
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  const mkId = str(res.data.mk_id);
  if (!mkId) return { ok: false, error: "metakocka: no document id returned", status: 502 };
  return {
    ok: true,
    order: {
      mkId,
      countCode: str(res.data.count_code) ?? mkId,
      totalPrice: str(res.data.total_price),
    },
  };
}

// Look a sales order up by its `buyer_order` (our idempotency key). Three outcomes,
// deliberately distinct: found, definitely absent (MK answered with an error
// envelope), or INCONCLUSIVE (transport failure / timeout) — callers must never
// create a new order on an inconclusive answer.
export type SalesOrderLookup =
  | { status: "ok"; order: DocDetail }
  | { status: "not-found" }
  | { status: "error"; error: string };

export async function getSalesOrderByBuyerOrder(buyerOrder: string): Promise<SalesOrderLookup> {
  const res = await callMetakocka("get_document", { doc_type: "sales_order", buyer_order: buyerOrder });
  if (res.ok) {
    if (res.data.mk_id) return { status: "ok", order: mapDetail(res.data) };
    return { status: "not-found" };
  }
  // 422 = MK's envelope said "no such document"; anything else is transport-level.
  if (res.status === 422) return { status: "not-found" };
  return { status: "error", error: res.error };
}

// A sales order by mk_id with the same three-way outcome (found / gone / MK down),
// shipped quantities included like getDocument("order", …).
export async function getSalesOrder(mkId: string): Promise<SalesOrderLookup> {
  const res = await callMetakocka("get_document", { doc_type: "sales_order", doc_id: mkId });
  if (res.ok) {
    if (!res.data.mk_id) return { status: "not-found" };
    const detail = mapDetail(res.data);
    detail.lines = await withShippedAmounts(detail);
    return { status: "ok", order: detail };
  }
  if (res.status === 422) return { status: "not-found" };
  return { status: "error", error: res.error };
}

// Delete a sales order (admin-confirmed only — used when detaching a superseded
// preorder order that staff no longer want in MK).
export async function deleteSalesOrder(mkId: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const res = await callMetakocka("delete_document", { doc_type: "sales_order", mk_id: mkId });
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  return { ok: true };
}

// Render a document PDF via /report. Returns the raw PDF bytes, or an error.
// The endpoint responds with binary on success and JSON on error, so we branch
// on Content-Type.
export async function getDocumentPdf(
  kind: DocKind,
  mkId: string,
): Promise<{ ok: true; bytes: ArrayBuffer } | { ok: false; error: string; status: number }> {
  const reportId = reportIdForKind(kind);
  if (!reportId) return { ok: false, error: "PDF not available for this document", status: 404 };

  const url = `${getBase()}/rest/eshop/v1/report`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret_key: getSecretKey(),
        company_id: getCompanyId(),
        mk_id: mkId,
        report_id: reportId,
        params: reportParams(),
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || contentType.includes("application/json")) {
      // JSON error body (or HTTP error).
      let error = `report failed (${res.status})`;
      try {
        const j = (await res.json()) as Record<string, unknown>;
        if (typeof j.opr_desc === "string") error = j.opr_desc;
      } catch {
        /* ignore */
      }
      return { ok: false, error, status: res.ok ? 422 : res.status };
    }
    return { ok: true, bytes: await res.arrayBuffer() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `metakocka unreachable: ${msg}`, status: 502 };
  } finally {
    clearTimeout(t);
  }
}
