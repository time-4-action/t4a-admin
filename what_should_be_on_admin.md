# What should be on the admin (gap analysis)

A map of capabilities and data that **already exist in the apps** (partner portal,
warranty service, Metakocka/PNV automation) but are **not yet visible or
manageable** in `t4a-admin`. Use it as a backlog: each gap says *what it is*,
*where the data lives*, *current admin state*, and *what to add*.

Legend for "Admin today": ✅ covered · 🟡 partial · ❌ not surfaced.

> Note: the partner-portal backend already exposes an internal admin surface
> (`/api/admin/partners/*`, `/api/admin/system/*`, bearer-gated by
> `PARTNER_ADMIN_TOKEN`). Most "no backend endpoint yet" gaps below are a thin
> controller addition there + a proxy route + UI here — the same pattern we
> already use.

---

## 0. What the admin covers today (baseline)

| Section | Pages | Covers |
|---|---|---|
| General | `/users` | Auth0 users, AI usage + spend limits, password resets |
| Access | `/roles*` | Roles, scopes, assignment, **Super Admins** |
| AI | `/ai/*` | AI dashboard, usage/cost, AI Access (role grant) |
| Warranty | `/warranty*` | Claims list + detail/workflow, email settings, audit log, access |
| Partners | `/partners*` | Partner list, per-partner detail (connections, sync jobs, feeds, export-config names, recent downloads, activity timeline, internal notes), **Catalogue Sync** (PNV + Own-Sources scheduler status + manual run), access |
| Automation | `/automation` | Warehouse & Products (Metakocka/PNV sync schedule, run history, run-now) |

So **scheduler status and per-partner activity are already surfaced**. The gaps
below are mostly about *operational detail* (errors, products, costs, config)
that the platform records but the admin can't yet see.

---

## 1. The apps in the ecosystem

| App | What it is | Admin oversight today |
|---|---|---|
| **t4a-partner-portal-api** | Express backend: PNV→Mongo catalogue, Metakocka stock/price enrichment, custom exports (CSV/JSON/XML), AI categorization (Claude Haiku), Shopify push engine, Own Sources feeds, API keys, schedulers | 🟡 activity + scheduler status only |
| **t4a-partner-portal-ui** | Next.js partner self-service (browse products, build exports, manage API keys, connect Shopify, manage Own Sources feeds) | n/a (partner-facing) — but each feature is something to oversee |
| **patrik-warranty-form** (warranty service) | External Next.js service: claim form, S3 uploads, Mongo, email, Google-Sheets logging, rate-limiting; admin reads it via `/api/warranty/*` | 🟡 claims/settings/audit; internals not surfaced |
| **t4a-partner-portal-video** | Remotion video renderer (demos/onboarding) | ❌ none needed — content tool, not operational |
| **shopify-app** | Legacy Shopify app scaffold — superseded by the in-portal OAuth flow | ❌ likely deprecated; confirm before investing |

---

## 2. Biggest gaps — Partner Portal

### 2.1 Product catalogue is invisible ❌  **(highest impact)**
- **What:** The `products` collection (PNV catalogue + Metakocka stock/pricing +
  AI categories, parent/variant shape) and per-feed `external_products`.
- **Admin today:** only a *count* on the partner rollup.
- **Add:** a searchable product view (by code/name/category) showing stock,
  resolved price, variants, images, published/active flags, AI categories.
  Lets you audit data quality, verify stock sync, catch uncategorized/duplicate
  products. *(Endpoint: `GET /api/admin/.../products?query=` — new.)*

### 2.2 Shopify sync detail & errors 🟡  **(highest impact — it's live and in-use)**
- **What:** `shopify_sync_jobs` (per-run counts, trigger, status, errors),
  `shopify_product_map` (SKU↔Shopify id mapping, unmatched SKUs), connection
  `config` (sync flags, ownership mode, location, sales channels), token
  freshness, rate-limit pressure.
- **Admin today:** partner detail lists connections + recent jobs with counts,
  but **no error details, no unmatched-SKU report, no config view, no rate-limit/token status**.
- **Add:** a connection detail pane — sync config (read, maybe edit), last run
  result with created/updated/failed + the "needs attention" unmatched list,
  deleted-in-store products, token/refresh state. This is the #1 support
  troubleshooting gap.

### 2.3 Own Sources (external feeds) health 🟡
- **What:** `own_sources` (URL, brand, schedule, `health.{lastImportAt,lastResult,lastError,counts}`, lock state) and `external_import_runs` (per-import errors, skipped rows, counts).
- **Admin today:** feed counts + status in partner detail; aggregate scheduler status on Catalogue Sync.
- **Add:** per-feed detail — feed URL/auth-header (token stays hidden), last
  import result + error, schedule (view/edit frequency), manual re-run, and a
  **release-stuck-lock** action.

### 2.4 AI categorization status & spend ❌  **(cost control)**
- **What:** `ai_categorization_runs` (per-export progress/errors) and
  `aiAnalytics` (input/output tokens per run, model). The portal calls Claude
  Haiku and records token usage today.
- **Admin today:** nothing — you can't see which exports are AI-enabled, run
  progress/failures, or **Claude API spend**.
- **Add:** an AI categorization panel (mirror the existing AI usage dashboard
  pattern): per-export enabled/last-run/categorized/errors + token cost
  attribution and trend. Optional: trigger a re-categorization without a full PNV sync.

### 2.5 Export configs & API keys ❌  **(audit/security)**
- **What:** `export_configs` (fields, filters, presets, pricelist priority,
  `accessList[]`, embedded `apiKeys[]` with `keyPrefix`/`lastUsedAt`/`isActive`)
  and the legacy `exports` collection.
- **Admin today:** only config *names* in partner detail.
- **Add:** browse a partner's export configs (fields/filters/preset/access),
  and an **API-key audit** (active vs stale by `lastUsedAt`, who created, revoke
  from admin). Currently keys are created/managed only by partners with zero
  oversight.

### 2.6 Scheduler controls (beyond status) 🟡
- **What:** `scheduler_state` (PNV cron, `nextRunAt`, `lockedUntil`,
  `runningBy`), `pnv_sync_runs` (per-run stats incl. `aiRuns[]`), Shopify
  pending-cleanup sweep state.
- **Admin today:** Catalogue Sync shows status + manual "Run now".
- **Add:** edit the PNV schedule, **release a stuck lock** (PNV lock can hold up
  to ~90 min), and a per-stage duration breakdown (PNV download → Metakocka
  enrich → AI → Shopify push) to spot bottlenecks. PNV sync *error detail* (CSV
  parse failures, affected codes) is also missing.

### 2.7 Platform-wide views ❌
- **What:** today everything is per-partner. There's no cross-partner roll-up.
- **Add (later):** a fleet view — sync failures across all partners, feeds in
  error, exports never downloaded, partners with stale Shopify tokens — i.e. a
  "what needs attention right now" dashboard. Good candidate for the home page.

---

## 3. Gaps — Warranty service

The admin proxies the external warranty service, so some of this lives outside
our control, but it's recorded there:

- **Email delivery status** ❌ — confirmation/admin emails are sent server-side;
  surface send success/failure (the audit only notes intent).
- **File uploads (S3)** ❌ — claim attachments live on S3 via signed URLs; no
  admin browse/audit of attachments or storage.
- **Settings-change audit** 🟡 — email-settings edits go through the change-log,
  but verify field toggles + recipients changes are captured.
- **Rate-limiting / abuse** ❌ — per-IP submission limits exist; no view of
  blocked attempts.
- **GDPR redaction & Sheets logging** ❌ — handled server-side; no admin trail.

Most of these need an endpoint added on the warranty service first.

---

## 4. Gaps — Automation (Metakocka / PNV)

- **Run error detail** 🟡 — `/automation` shows status + history; add what
  changed (created/updated/deactivated counts are in `pnv_sync_runs.stats`) and
  the actual errors/rejected rows.
- **Stock discrepancy signals** ❌ — Metakocka returns reserved/available/free
  per location; surface fetch errors and anomalies (e.g. negative free stock).
- **Schedule-change audit** ❌ — no record of who changed the cron / triggered a run.

---

## 5. Suggested priority

**Tier 1 — do first (live, in-use, high support value)**
1. Shopify connection detail + sync errors / unmatched-SKU report (§2.2)
2. Product catalogue browser per partner (§2.1)
3. AI categorization status + Claude spend (§2.4)

**Tier 2 — operational control & audit**
4. Own Sources feed detail + schedule + unlock (§2.3)
5. Export-config browser + API-key audit/revoke (§2.5)
6. Scheduler edit + stuck-lock release + PNV error detail (§2.6)

**Tier 3 — observability & polish**
7. Cross-partner "needs attention" dashboard, ideally on the home page (§2.7)
8. Warranty email-delivery + file/abuse visibility (§3)
9. Automation run-error detail + schedule audit (§4)

---

## 6. Implementation note

Almost every Tier 1–2 item follows the existing pattern:
1. add a read endpoint to the portal's `adminPartnersController` / a new
   `adminSystemController` method (gated by `PARTNER_ADMIN_TOKEN`),
2. add a thin `/api/...` proxy route in `t4a-admin` (see `lib/partner-api.ts`),
3. render it in the relevant `app/partners/[sub]` or `app/automation` page using
   the existing card/table components.

No new infrastructure is required — the data already exists in the shared
`t4a` MongoDB; it's a surfacing exercise.
