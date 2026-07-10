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
): Promise<MkResult> {
  const url = `${getBase()}/rest/eshop/v1/${endpoint}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
  return {
    mkId: String(p.mk_id),
    countCode: str(p.count_code),
    name: str(p.customer),
    taxId: str(p.tax_id_number),
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
  };
}

function mapDetail(raw: Record<string, unknown>): DocDetail {
  return {
    ...mapSummary(raw),
    partner: mapPartnerRef(raw.partner),
    notes: sanitizeNotes(str(raw.notes) ?? str(raw.notes_header)),
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

async function searchDocType(
  docType: string,
  partnerMkId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ items: DocSummary[]; total: number }> {
  const body: Record<string, unknown> = {
    doc_type: docType,
    result_type: "doc",
    limit: opts.limit ?? 100,
    offset: opts.offset ?? 0,
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

// List a partner's documents for one family. Invoices merge domestic + foreign
// (each capped at `limit`; sorted newest-first). Returns items + an approximate
// total across the underlying doc_types.
export async function listDocuments(
  kind: DocKind,
  partnerMkId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ items: DocSummary[]; total: number }> {
  const docTypes = DOC_TYPES[kind];
  const results = await Promise.all(
    docTypes.map((dt) => searchDocType(dt, partnerMkId, opts)),
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
      return mapDetail(res.data);
    }
  }
  return null;
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
        params: [{ type: "REPORT_TYPE", value: "PDF" }],
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
