# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Build for production (outputs standalone bundle)
npm run start    # Run the production build
```

```bash
npm test             # vitest (preorder business logic; Mongo tests use mongodb-memory-server)
npm run typecheck    # tsc --noEmit
```

No linter is configured.

**Docker / production:**
```bash
docker compose up --build   # Build and run on port 3005
scripts\build.bat            # Build image (tag: yyyymmdd-hhmmss)
scripts\build.bat --latest   # Build image (tag: latest)
scripts\push.bat --latest    # Push image to time4action/t4a-admin
```

## Git Workflow

Work flows through an integration branch — **never PR a feature branch directly into `main`.**

```
feature branch  →  PR into  dev  →  (when a release is ready)  PR  dev → main
```

1. **Branch off `dev`** for every change. Name it `feat/...`, `fix/...`, etc.
2. **Open the PR against `dev`** (the base branch), not `main`. `dev` is the default integration target where features are merged and tested together.
3. **`dev` → `main`** happens only when a batch of work is verified and ready to ship. Open a separate PR from `dev` into `main` for that promotion.
4. **`main` is the production / release branch.** It should always reflect deployable state.

When creating a PR with `gh pr create`, pass `--base dev` explicitly so it does not default to `main`.

## Architecture Overview

This is a **Next.js 16 App Router** admin dashboard for managing users, access types (Auth0 roles), and AI usage costs. It is deployed as a standalone Docker container on port 3005.

### Authentication & Authorization

All routes except `/forbidden` and `/unauthorized` are protected by `middleware.ts`, which delegates to `lib/proxy.ts`. The middleware:
1. Runs the Auth0 SDK middleware for session management.
2. Verifies the user has the `"admin"` role by decoding the Auth0 ID token JWT directly (custom claims under `https://time-4-action.com/roles`). The Auth0 `userinfo` endpoint does not forward custom claims, so the raw JWT payload must be parsed manually.
3. Redirects unauthenticated users to `/auth/login`.
4. **Non-admins are routed to the B2B customer portal, not `/forbidden`.** `/portal/*` (and `/api/portal/*`) are open to any authenticated user — a customer holds no role; their identity is the session email, matched to a Metakocka partner inside the portal (see the B2B Customer Portal module). A logged-in non-admin who hits any admin route is redirected to `/portal`. Admins who lack a specific section's role still get `/forbidden`. Portal paths are recognized by `isPortalPath()` in `lib/access.ts` and are intentionally absent from `ROUTE_RULES`.

Auth0 session client: `lib/auth.ts` (singleton `auth0`).  
Auth0 Management API client: `lib/mgmt.ts` (singleton `ManagementClient`, lazy-initialized).

> **Note:** Auth0's `users.create` requires a `username` field for Username-Password-Authentication connections. Omitting it causes a 400 "Missing required property: username" error.

### Data Sources

All API routes merge data from two sources:

- **Auth0 Management API** — user identities, roles, password resets (via `lib/mgmt.ts`).
- **MongoDB** — AI usage and spend data, user spending limits, conversation counts (via `lib/mongodb.ts`).

MongoDB connection is cached on `global._mongooseConn` to survive Next.js hot-reload.

### MongoDB Models (`models/`)

| Model | Collection | Purpose |
|---|---|---|
| `UserUsage` | `userusages` | Per-user, per-model token counts and cost. Unique index on `(userId, modelId)`. |
| `UserLimit` | `userlimits` | Per-user spending cap with period (`daily/weekly/monthly/total`) and current spend. |
| `Conversation` | `conversations` | One document per conversation; used only to count `convToday` on the dashboard. |
| `BuilderPreset` | `builderpresets` | A saved Section Builder configuration, **shared** across everyone with builder access. `config` is the builder's own state blob (opaque to the server); carries creator/last-editor stamps, a `versionLabel`, a notes thread, and a capped version history. Index on `(builder, updatedAt)`. |
| `PreorderCampaign` | `preordercampaigns` | One master order sheet (`tabs` → groups → rows) + embedded `markets[]`, `customerRules[]`, `priceBooks[]`, `vatOverrides[]`, invite `shareToken`. See the Preorder module. |
| `PreorderSubmission` | `preordersubmissions` | One partner's response per campaign (unique `(campaignId, partnerMkId)`): lines, totals, frozen `snapshot`, MK order reference `mkSalesOrder` + sync state `mkOrder`, publication flags, detached-order history. Indexes on `partnerMkId + mkOrder.state`, `mkSalesOrder.mkId`, `mkOrder.buyerOrder`. |
| `PreorderAccess` | `preorderaccesses` | The invite grant (`(campaignId, partnerMkId)` unique) — the campaign access boundary. |
| `MkCustomer` | `mkcustomers` | Directory of Metakocka partners (address, tax id, resolved country, manual country, stale flag) feeding Markets & Customers; `MkCustomerSyncState` (singleton) tracks the full sync. |
| `VatSettings` | `vatsettings` | Singleton (`key: "vat"`): the global VAT rate per country + optional fallback rate, edited at `/preorder/vat-rates`. See Pricing & VAT in the Preorder module. |

### Dev-User Filtering

Users with the "dev" role (configurable via `NEXT_PUBLIC_DEV_ROLE_NAME`, default `"dev"`) are hidden from user lists and their usage is aggregated under a single synthetic `"Development"` entry in all cost reports. The helper `lib/dev-users.ts` fetches dev user IDs efficiently with 2 Auth0 API calls regardless of user count.

### Access Types (Roles)

Auth0 roles are surfaced in the UI as **access types**. The nav section and all pages use "Access" terminology rather than "Roles".

`lib/ai-role.ts` exports two configurable role names:
- `AI_ROLE_NAME` (env `NEXT_PUBLIC_AI_ROLE_NAME`, default `"AI User"`) — the role that grants access to the AI product.
- `DEV_ROLE_NAME` (env `NEXT_PUBLIC_DEV_ROLE_NAME`, default `"dev"`) — internal development role that is hidden from the admin UI.

The dev role is filtered out from the roles list returned by `GET /api/admin/roles` and cannot be created via the API.

#### Access pages (`app/roles/`)

| Page | Path | Notes |
|---|---|---|
| Access Types list | `/roles` | Lists access types with permissions inline; gear icon opens permission editor; trash deletes |
| New Access Type | `/roles/new` | Create role + assign permissions |
| Assign Access | `/roles/assign` | Multi-select users + assign/revoke access types |

**API permissions** (Auth0 resource server scopes) are scoped to a single resource server: `https://api.time-4-action.com`. The `GET /api/admin/resource-servers` route filters to only this identifier — the server name and identifier are never shown in the UI, only the permission/scope names themselves.

The per-role permissions dialog (`app/roles/page.tsx`) shows a flat searchable list of all scopes with checkboxes. It has a "Select all / Deselect all" control and a search bar that filters by scope name or description. Changes diff against originals and call `POST`/`DELETE /api/admin/roles/[id]/permissions`.

**Assign Access page** (`app/roles/assign/page.tsx`) supports two modes:
- **Single user selected** — drag-and-drop two-column UI (Current Access / Available Access) using `@dnd-kit/core`.
- **Multiple users selected** — batch view with per-access-type `X/Y users` count badges and one-click "Grant all" / "Remove all" buttons. Saves in parallel for all changed users. Sensitive role assignments (AI, Admin) require a confirmation dialog with toggle switches in both modes.

#### User detail sidebar (`app/users/[id]/user-detail-client.tsx`)

The sidebar "Access" section also uses drag-and-drop (same `@dnd-kit/core` pattern) to assign/remove access types for a single user.

### Column-heading filters

Per-column list filters live **in the column heading**, never in a separate
filter row: `components/ui/header-filter.tsx` (`<HeaderFilter label value
onChange options>`). It reads as a normal heading with a faint funnel glyph,
opens a popper dropdown below the heading, and shows the pick as a green chip
once filtered (`value === "all"` = unfiltered; the first item always clears).
Used by the documents list (Status), the preorder customers table (Type,
Country, Market, Access, Overrides, Preorder) and the preorders table (Market,
Stage). Free-text search and a "Reset filters" link stay in the card's top row.

### UI Loading Patterns

All data-loading states use a **shimmer skeleton** system — never plain "Loading…" text.

- **CSS class:** `.skeleton` defined in `app/globals.css` — a left-to-right shimmer gradient animation, works in light and dark mode. Use it directly on any element: `<div className="skeleton rounded-lg h-4 w-32" />`.
- **Skeleton elements must match the real layout** — dimensions, spacing, and structure should mirror what the loaded content looks like (e.g. table rows show per-column skeleton cells at realistic widths, chart skeletons reproduce the chart's flex/grid structure).
- **Staggered animation delays** — apply `style={{ animationDelay: \`${i * 80}ms\` }}` per skeleton element for a cascading wave effect.
- **Button loading states** — pair `<Loader2 className="w-3.5 h-3.5 animate-spin" />` (from `lucide-react`) with the label text when an action is in progress. Buttons are `disabled` during the operation.

### Currency

All costs are stored in USD. `lib/currency-context.tsx` provides a client-side `CurrencyProvider` that lets the user toggle between USD and EUR display. The EUR/USD rate is a constant in `lib/currency.ts`.

### Warranty module (`app/warranty/`)

A read/update surface over the **patrik-warranty-form** service. The warranty
service exposes `/api/admin/*` behind a shared `INTERNAL_ADMIN_TOKEN`; this
admin calls those endpoints server-side via `lib/warranty-api.ts` and proxies
them under `/api/warranty/*` so the bearer token never reaches the browser.

| Page | Path | Notes |
|---|---|---|
| Submissions list | `/warranty` | Searchable, status-filterable table of every warranty claim. |
| Submission detail | `/warranty/[submissionId]` | Full claim view with file thumbnails + status editor in the sidebar. |
| Warranty Access | `/warranty/access` | Mirrors AI Access (`app/ai/access`): per-user toggle of the `warranty-admin` role with a grant-confirmation dialog. Reuses `/api/admin/users` + `/api/admin/roles` + `PATCH /api/admin/users/[id]/roles`. Because `warranty-admin` is a privileged role, granting/revoking it is **super-admin only** (enforced in the roles PATCH route); the nav link is therefore hidden from non-super-admins via the `superAdminOnly` flag in `components/nav.tsx`. |
| Email settings | `/warranty/settings` | Recipients chip input + customer/admin email subject, intro, outro, and per-field toggles. Persists to the warranty service's `warranty_settings` Mongo collection. |

| Proxy route | Methods |
|---|---|
| `/api/warranty/submissions` | GET |
| `/api/warranty/submissions/[submissionId]` | GET, PATCH |
| `/api/warranty/settings` | GET, PUT |
| `/api/warranty/assignees` | GET |
| `/api/warranty/audit` | GET |

**Assignees come from Auth0, not a hardcoded list.** `GET /api/warranty/assignees`
returns the users holding the `warranty-admin` role (via `lib/role-users.ts` →
`getUsersWithRole`, the same 2-call pattern as `lib/dev-users.ts`). The list page
filter, the per-row inline picker, and the claim detail "Assigned to" select all
load it through the `useWarrantyAssignees()` hook (`app/warranty/use-assignees.ts`).
The stored `assignee` is the user's **display name** (a plain string), so the
warranty service is unchanged and legacy / removed assignees still render — the
`assigneeOptions()` helper injects the claim's current value if it is no longer in
the role. This route lives under `/api/warranty/*` (not `/api/admin/roles/*`) so
`warranty-admin` users — who are not access-admins — are not 403'd by the section
gate in `lib/access.ts`. Role name is configurable via
`NEXT_PUBLIC_WARRANTY_ADMIN_ROLE_NAME` (default `"warranty-admin"`).

Required env vars (server-side only — both are secrets):

```
WARRANTY_API_BASE=https://warranty.<host>
INTERNAL_ADMIN_TOKEN=<must match the warranty service>
```

Shared types live in `types/warranty.ts` and mirror
`patrik-warranty-form/src/types/warranty-settings.ts`. Keep them in sync by
hand whenever a status / field is added.

#### Change history (audit log)

Workflow edits are **not autosaved**. The Workflow card on `/warranty/[id]`
stages edits to a local draft; a **Save changes** button opens a
`ChangeLogModal` (`components/change-log-modal.tsx`) that previews every pending
change (`label · before → after`) and takes an **optional** note. The email
settings page (`/warranty/settings`) wraps its existing Save button in the same
modal.

**The audit log is owned and stored by the warranty service** — this admin
stores nothing. On every save the admin sends an `_audit` envelope alongside the
write; the service records the entry and **computes the field-level changes
itself** (it is the source of truth for what persisted). The service-side
contract lives in the `patrik-warranty-form` repo.

- `lib/warranty-audit.ts` — `buildAuditEnvelope(audit)` stamps the actor from
  the Auth0 session server-side (`actorId/actorName/actorEmail`, never trusted
  from the browser) and carries the optional `message`. The client sends only
  `{ audit: { message } }`; the `changes` it computes are used **only** for the
  in-modal preview, not sent.
- The submissions `PATCH` and settings `PUT` proxy routes swap the client's
  `audit` field for the server-built `_audit` and forward it to the service
  (`{ ...fields, _audit }`).
- `GET /api/warranty/audit?entityType=claim|settings&entityId=<id>` proxies to
  the service (`/api/admin/submissions/:id/audit` or `/api/admin/settings/audit`)
  and returns `{ entries }` straight through. It lives under `/api/warranty/*`
  so warranty-admins (not only super-admins) can read it. `GET` only.
- `components/audit-history.tsx` (`<AuditHistory>`) is a self-fetching timeline
  card shown on the claim detail (`entityType="claim"`, `entityId=submissionId`)
  and the settings page (`entityType="settings"`, `entityId="settings"`). Bump
  its `refreshKey` after a save to reload.
- `AuditEntry` / `AuditChange` in `types/warranty.ts` mirror the service's audit
  shape — keep in sync by hand like the other warranty types.

### Partners module (`app/partners/`)

A read/update surface over the **t4a-partner-portal** API, modelled on Warranty.
A "partner" is an Auth0 user holding the portal's export role
(`NEXT_PUBLIC_PARTNER_ROLE_NAME`, default `"export"`). The portal exposes an
internal admin surface at `/api/admin/partners/*` behind a shared
`PARTNER_ADMIN_TOKEN`; this admin calls it server-side via `lib/partner-api.ts`
(`callPartnerPortal`) and proxies it under `/api/partners/*` so the token never
reaches the browser. The portal **owns** all partner data (activity, notes); this
admin stores nothing.

| Page | Path | Notes |
|---|---|---|
| Partners list | `/partners` | All export-role Auth0 users joined with per-partner portal activity (Shopify connections, exports + downloads, feeds, last-active). Dormant partners show with zeros. |
| Partner detail | `/partners/[sub]` | Insight cards (Shopify / Exports / Own Sources), "most interacted with", activity timeline, and a timestamped internal-notes log. `sub` is the Auth0 sub (URL-encoded). |
| Catalogue Sync | `/partners/sync` | Global (not per-partner) view of the portal's in-app schedulers: PNV catalogue refresh, Own Sources feed imports, Shopify pending-cleanup sweep. Status cards (next/last run, duration, result), a PNV run-history table, an Own Sources feed table, and **Run now** buttons (full PNV pipeline + per-feed). Polls `/api/partners/sync` while a run is in flight. Fed entirely by the portal's `/api/admin/system/*` surface. |
| Partners Access | `/partners/access` | Per-user toggle of the **partner** role (`PARTNER_ROLE_NAME`, default `export`) — i.e. manage *who is a partner*. Granting it makes a user appear in the Partners list and gives them partner-portal access. Reuses `<AccessManager>`. (This is distinct from `partners-admin`, the role that gates the admin section itself — that one is managed via the general Access section.) |

| Proxy route | Methods |
|---|---|
| `/api/partners` | GET (list: `getUsersWithRole` + portal `/overview`, joined by sub) |
| `/api/partners/[sub]` | GET |
| `/api/partners/[sub]/activity` | GET |
| `/api/partners/[sub]/notes` | GET, POST (author stamped from the session, like warranty notes) |
| `/api/partners/[sub]/notes/[noteId]` | DELETE |
| `/api/partners/sync` | GET (proxy portal `/api/admin/system/sync`) |
| `/api/partners/sync/run` | POST (proxy portal `/api/admin/system/sync/pnv/run` — full pipeline) |
| `/api/partners/sync/own-sources/[feedId]/run` | POST (proxy portal feed run) |

The partner list is the set of Auth0 users with `PARTNER_ROLE_NAME` (via
`lib/role-users.ts` → `getUsersWithRole`, the same 2-call pattern as
`lib/dev-users.ts`). Activity comes from the portal, which logs it via a new
`activity_log` / `partner_activity` instrumentation (login/last-active, export
downloads, Shopify/feed actions). Shared types live in `types/partner.ts` and
mirror the portal's `src/controllers/adminPartnersController.js` — keep in sync
by hand. Role names are configurable via `NEXT_PUBLIC_PARTNERS_ADMIN_ROLE_NAME`
(default `"partners-admin"`) and `NEXT_PUBLIC_PARTNER_ROLE_NAME` (default
`"export"`) in `lib/partner-role.ts`.

Required env vars (server-side only):

```
PARTNER_API_BASE=https://<partner-portal-api host>   # e.g. https://api.time-4-action.com
PARTNER_API_TOKEN=<must match the portal's PARTNER_ADMIN_TOKEN>
```

### Automation module (`app/automation/`)

A read/update surface over the **t4a-mk-automation** service (the Metakocka warehouse +
products sync engine). Modelled on Warranty/Partners: the service exposes `/api/v1/*`
behind an `x-api-key`; this admin calls it server-side via `lib/mk-api.ts`
(`callMkAutomation`) and proxies it under `/api/automation/*` so the key never reaches the
browser. The service owns its data (cron schedules in `cron.json`, run history in SQLite).

Gated by a new `automation` section (`SECTION_ROLES.automation = ["admin", "automation-admin"]`).

The section is split into an **overview** plus a **dedicated page per sync**. All three
render the same cards/modals/history off one shared client module,
`app/automation/automation-shared.tsx` (helpers + `SyncCard` + `RunDetailsModal` +
`CronEditorModal` + `RunHistoryTable` + the `useAutomation()` data hook + `SingleSyncPage`).
`/api/automation/status` already returns both syncs and both run lists, so every page hits
the same endpoint and renders its slice.

| Page | Path | Notes |
|---|---|---|
| Overview | `/automation` | Both cards (Warehouse, Products) + a **combined** run-history table. Each card links to its dedicated page. |
| Warehouse | `/automation/warehouse` | Warehouse card + "How it works" + warehouse-only history. Reads T4A free stock → CREAGLOBE T4A virtual warehouse. **ProMode/Germany source is retired** (engine keeps the disabled code). |
| Products | `/automation/products` | Products card + "How it works" + products-only history. **One-way** sync: T4A is the source of truth, CREAGLOBE is updated to match (never the reverse). |

Each card shows status, a plain-English schedule with an inline cron editor (presets + live
`humanizeCron` preview), next/last run, and **Run now**; the shared hook polls every 4s while
a sync is running. Run details surface per-item errors for both warehouse (`sync_stock`
`error_list`) and products.

| Proxy route | Methods |
|---|---|
| `/api/automation/status` | GET (mk `/api/v1/status` + `/api/v1/runs` per type, combined) |
| `/api/automation/schedules/[type]` | PUT (`type` = `warehouse` \| `products` → mk schedule endpoints) |
| `/api/automation/[type]/run` | POST (mk run endpoints — 202 started / 409 already running) |

The mk-automation run endpoints are **asynchronous**: they record a row in the service's
`sync_runs` table, run in the background, and respond `202` immediately. Shared types live
in `types/automation.ts`. Required env vars (server-side secrets):

```
MK_API_BASE=https://<mk-automation host>
MK_API_TOKEN=<must match the service's API_KEY>
```

### Builder module (`app/builder/`)

A **fully client-side** tool that generates copyable HTML snippets for the
marketing website's "sections". It is a polished admin-portal port of the
**t4a-main-website-sections** repo (used only as the concept reference) — it
calls **no backend** and stores nothing. Each snippet is scriptless: only markup
+ `data-*` config, rendered on the live site by one shared script
(`patrik-components.js`). Gated by a new `builder` section
(`SECTION_ROLES.builder = ["admin", "builder-admin"]`).

| Page | Path | Notes |
|---|---|---|
| Section Builder hub | `/builder` | Landing page: lists the available builders + a "how it works" primer and a renderer download. |
| Radar Chart builder | `/builder/radar-chart` | Performance octagon — single dataset or a comparison dropdown; axes, values, and optional colours. |
| Range Bars builder | `/builder/range-bars` | Feel / rider-goal bars — two-pole or labelled-scale mode, optional marker + band colour. Add any number of bars. |
| Section Layout composer | `/builder/layout` | Arranges the components above into rows and columns — see the composer section below. |
| Builder Access | `/builder/access` | Per-user toggle of the `builder-admin` role. Reuses `<AccessManager>` (`fuchsia` accent); super-admin only (mapped to the `system` section in `ROUTE_RULES`, like the other `*/access` pages). |

Each builder holds its own state, generates the markup in a `useMemo`, and renders
through the shared `BuilderShell` in `app/builder/builder-ui.tsx` (which also holds
the controls kit, the syntax-highlighted copyable code panel, and the live
preview). Code generation is a faithful port of the reference builders' logic.

**The live preview uses the real renderer, not a re-implementation.** The
website's `patrik-components.js` is bundled verbatim at `public/patrik-components.js`;
`lib/use-patrik-components.ts` loads it once and re-runs it over the preview
subtree, so the preview is byte-identical to production output. The same file is
offered as a download from the builder pages.

**Comparison mode has a default option.** Both compare builders carry a
`defaultIndex` in their config, written into the snippet as `selected` on that
`<option>` (the renderer reads `select.selectedIndex`, so the hosted script needs
no change). It is set either from the **"Show first"** pill on the dataset/model
card, or simply by **switching models in the live preview** — `PreviewPanel`
takes an `onSelectDefault` callback and reads the (hidden, renderer-synced)
`<select>` back after any interaction, since the custom dropdown fires no
`change` event.

The **layout composer does the same for every chart it holds**: `onSelectDefault`
reports *all* compare dropdowns in the preview in document order, which is the
order the markup emits them, so they line up 1:1 with `compareBlockIds(config)`
and each index lands on its own block. A block's pick is a **placement** choice,
not part of the build — `syncBlocksToPresets` refreshes the cached config with
`keepDefaultIndex`, so the same build can open on a different model in two
different sections and survive a reload. The block editor exposes the same thing
as a "Shown first" select.

**Saved builds (shared team presets).** Saved builds are **shared across
everyone with builder access** (the section gate is the ACL — nothing is
user-scoped except note deletion). Each builder header has a primary **Save**
button (with an unsaved-changes dot) that opens a proper save modal
(`SaveBuildModal` in `app/builder/builder-ui.tsx`): update the loaded build vs.
save as new, build name, a **required version name** ("what changed?"), and an
optional team note. The "Saved builds" dropdown (`SavedPresets`) is browse/load
only (plus rename + two-step delete) and deep-links load via
`/builder/<id>?preset=<presetId>`. Presets live in MongoDB (`BuilderPreset`
model) with creator/last-editor stamps, a **notes thread**, and a **capped
version history** (`MAX_PRESET_VERSIONS = 30`): every config overwrite pushes
the previous state (with its version name, editor, time) onto `versions`.
Reverting snapshots the current state first, so reverts are revertible. Each
builder passes `presetKey` + `getConfig()`/`applyConfig()` to `BuilderShell`;
the config is the builder's own state blob (opaque to the server; range-bars
`stopKeys` are volatile drag-and-drop identities, ignored by the dirty check).

Markup generation is extracted into `app/builder/generators.ts`
(`generateSnippet(builder, config)` + per-builder functions/defaults/normalizers)
so the Saved Builds pages render **real previews** with the same renderer as the
builders. Wire types live in `types/builder.ts`.

The **control panels** live in `app/builder/section-controls.tsx`
(`RadarControls`, `RangeBarsControls`) — fully controlled `(value, onChange)`
components taking the builder's config object. `/builder/radar-chart` and
`/builder/range-bars` are thin wrappers around them (one config object of state
each). The only state a panel owns is drag-and-drop identity (axis keys,
`stopKeys`), which never reaches the markup. `startNum` shifts the numbered group
badges for callers that slot a panel in after their own groups.

#### Section Layout composer (`app/builder/layout/`)

`/builder/layout` composes a whole section: a canvas of **rows**, each holding
one or more **blocks** side by side. Blocks are dragged within a row, between
rows, or onto a trailing zone to start a new row (`@dnd-kit`, one `DndContext`
with a `SortableContext` + `useDroppable` per row); rows move with up/down
buttons. Block types: `radar-chart`, `range-bars`, `heading`, `text`, `divider`,
`spacer`. Selecting a block edits it in the left panel.

**A chart block IS a saved build — the composer arranges, it never edits.**
There is no ad-hoc chart here: the "+ Block" menu is two-step for the chart
types (pick the component → pick which saved build), and the block editor's
"Saved build" select is the only way to change what a block shows. Editing the
chart itself means opening it in its own builder (the editor deep-links to
`/builder/<type>?preset=<id>`). Only layout properties — width share, row, and
position — are editable on the block.

`block.source = {id, name}` is the live link to the build; `block.config` is a
**cached copy** of it, so `generateSnippet` and the Saved Builds thumbnails work
from the layout config alone. `syncBlocksToPresets()` refreshes every copy from
the current builds whenever the preset list loads (and on loading a saved
layout), so a layout always shows the current state of the builds it points at.
A block whose build was deleted keeps its last copy and says so in the editor.

Block types beyond the charts: `heading`, `text`, `image`, `button`, `divider`,
`spacer`. Every block also carries **`insetX` (% of its column) / `insetY` (px)**,
and every row can become a **band** (`background` + `padX`/`padY` + `radius`;
an empty background emits the row exactly as before). The row panel has
one-click column splits (`splitPresets`) that rewrite every span in the row,
and an optional **stacked spacing** (`stackGap`, emitted as `data-stack-gap`,
applied by the renderer as the row's `row-gap`): the vertical gap between the
row's blocks once they wrap on narrow screens. `null` (the default) follows
the column gap; `0` is meaningful (blocks touching), so presence — not
truthiness — gates the attribute.

**Insets are aesthetic breathing room only.** They used to be load-bearing:
radar axis labels were painted outside the SVG box, so radar blocks defaulted
to `insetX = LAYOUT_LABEL_ROOM` (10%) to keep them out of the neighbouring
column. The renderer now grows the viewBox to *contain* the labels, so that
room is pure wasted width — `layoutBlockInsetDefault` is 0 for every type, and
`normalizeLayoutBlock` migrates a radar block whose stored `insetX` equals the
old 10% auto-default back to 0 (any other value is a deliberate author choice
and is kept; `LAYOUT_LABEL_ROOM` survives only as that migration constant).
The inset is carried as `data-inset-x`/`data-inset-y` on the column but
**applied by the renderer to an inner `.patrik-layout-cell`, never to the
column itself**: a percentage padding resolves against the containing block,
so on the column it would be a share of the whole row instead of of the
column. **Horizontal insets fade out on narrow sections** — they are breathing
room between side-by-side columns, so once the columns have stacked they would
only shrink the content: the cell's padding is `clamp()`ed against the
section's `--pl-w` (0 at ≤480px, authored value fully back by ~1000px), which
also heals legacy pasted layouts that still carry `data-inset-x="10"` on
mobile.

The emitted markup is pure **structure** — `.patrik-layout` /
`.patrik-layout-row` / `.patrik-layout-col` divs carrying only classes +
`data-*` config (`data-max`, `data-gap`, `data-span`, `data-band`, …), no
inline styles. `patrik-components.js` owns all of the layout's styling AND its
responsive behaviour: it injects a stylesheet, maps the `data-*` onto CSS
variables, computes column shares from `data-span`, and mirrors the section's
own rendered width into a `--pl-w` variable (ResizeObserver) from which gaps,
band paddings, spacer heights and heading sizes scale fluidly via
`min()`/`clamp()`. Columns stack via `flex-wrap` + `min-width: min(100%,
<wrapAt>px)` — no media queries anywhere, so the preview's simulated viewport
widths behave exactly like real devices. **The hosted renderer must therefore
be the current build of `public/patrik-components.js`** for layout snippets;
layouts generated before the `data-*` format (inline styles, no `data-max`)
are detected by the script and left untouched, so already-pasted sections keep
working. `data-max` is always emitted — it doubles as the format marker. The
preview panel gains a viewport-width switcher (`PreviewPanel responsive`) to
check the stacking. The layout itself saves as a `layout` preset like any
other build.

**Component responsiveness is element-driven, not viewport-driven.** The
renderer watches each component's own rendered width: radar-chart axis labels
are **scale-compensated** (after fitting the viewBox the script measures px
per SVG user unit and redraws the labels at a larger user-unit size — plus
proportional point/stroke/offset scaling — whenever they would render below
~10px, so a chart in a narrow column or on a phone stays readable); range bars
step their type/track down through `data-pc-w="md|sm|xs"` buckets set from
their own width. Inside a layout column a default-size radar fills its column
share so side-by-side blocks balance visually — capped at 560px only when the
column is alone in its row (`:not(:only-child)` lifts the cap, the column
itself being the size limit); an explicit `data-size` still wins and is
applied as `min(<size>px, 100%)`.

| Page | Path | Notes |
|---|---|---|
| Saved Builds list | `/builder/saved` | First nav entry of the section. Full-width; search (name/person), builder filter, grid/list toggle (persisted in localStorage), scale-to-fit live thumbnails on the black site surface. |
| Saved build detail | `/builder/saved/[id]` | Live preview + snippet, inline rename, "Open in builder" (via `?preset=`), two-step delete, team notes thread, and the version timeline — preview any version (amber banner) or restore it (two-step). Server wrapper stamps the viewer for own-note deletion. |

API (gated by the `builder` section via the `/api/builder` rule in `lib/access.ts`):

| Route | Methods |
|---|---|
| `/api/builder/presets` | GET (`?builder=`, all shared; the composer fetches unfiltered to offer every saved build), POST (`{builder,name,config,versionLabel}` — versionLabel required; `builder` ∈ `radar-chart`/`range-bars`/`layout`) |
| `/api/builder/presets/[id]` | GET (detail incl. notes + versions), PATCH (rename and/or `config`+`versionLabel`; config change snapshots a version), DELETE |
| `/api/builder/presets/[id]/notes` | POST (`{text}`, author stamped from session) |
| `/api/builder/presets/[id]/notes/[noteId]` | DELETE (author-only) |
| `/api/builder/presets/[id]/revert` | POST (`{versionId}` — snapshots current, restores the version) |

The `<script src="…">` line written into every **generated snippet** is a
**hardcoded** constant `BUILDER_SCRIPT_URL` in `lib/builder-role.ts` (the
canonical hosted renderer at
`https://www.patrikinternational.com/assets/added_js_files/patrik-components.js`)
— not env-configurable. Role name is configurable via
`NEXT_PUBLIC_BUILDER_ADMIN_ROLE_NAME` (default `"builder-admin"`, also in
`lib/builder-role.ts`). To add a new section builder: bundle its renderer logic
into `patrik-components.js`, add its config/generator/normalizer to
`generators.ts` (plus a `BUILDER_META` entry and `VALID_BUILDERS` in
`app/api/builder/presets/helpers.ts`), put its panel in `section-controls.tsx`,
then add a `/builder/<name>` page that drives `BuilderShell` (see the existing
builders as templates). A new block type in the composer needs a
`LayoutBlock` variant (on top of `LayoutBlockBase`), a `layoutDefaultBlock` case,
a `normalizeLayoutBlock` case, a `generateLayoutBlock` case, a `blockSummary`
case, and an entry in the layout page's `BLOCK_META` / `BLOCK_ORDER`.

### B2B Customer Portal + Documents module (`app/portal/`, `app/documents/`)

One integration, **two faces**, over the **raw Metakocka REST API**
(`https://main.metakocka.si/rest/eshop/v1/*`). Customers view their **own**
offers / sales orders / invoices; admins browse **any** customer's. Both faces
render the same document components (`app/documents/documents-shared.tsx`); only
the partner-id source differs.

- **Customers** (`app/portal/*`) log in **passwordless** (Auth0 OTP) and hold
  **no role**. Their email is matched to a Metakocka partner via
  `/get_partner`; unmatched → `/portal/no-account`. The shell is the stripped-down
  **"Time 4 Action B2B"** nav (`components/portal-nav.tsx`), chosen by pathname in
  `components/app-shell.tsx` (the root layout no longer renders `<Nav>` directly).
- **Admins** (`app/documents/*`) get a new `documents` section
  (`SECTION_ROLES.documents = ["admin", "documents-admin"]`) — a partner picker →
  per-customer Offers/Orders/Invoices tabs → detail.

**Metakocka client** — `lib/metakocka.ts` (`server-only`, distinct from
`lib/mk-api.ts` which is the mk-automation sync service). Every call is a POST
whose JSON body carries `secret_key` + `company_id`; the `opr_code` envelope
(`"0"` = OK) is checked. Key functions: `resolvePartnerByEmail` (email→partner,
exact-contact-match only, short in-process TTL cache), `searchPartners` /
`getPartnerById` (admin picker), `listDocuments(kind, partnerMkId)` (per-family
`/search` with `query_advance partner_mk_id`, **paged through to the end** — MK
caps a page at 100, so every page is fetched and merged; invoices merge
`sales_bill_domestic` + `sales_bill_foreign`), `getDocument(kind, mkId)` (tries
each doc_type for the kind; bills add payment flags; **orders also fetch the
delivery notes (`warehouse_packing_list`) linked from `doc_link_list` and sum
their quantities per product code into `line.shipped`** — that is what MK's
own "Shipped" column shows; the REST API has no per-line figure and no
line-level link, so a product added to the note before the order is the one
known mismatch),
`getDocumentPdf(kind, mkId)`
(`/report`, needs a report_id). `DocKind` = `offer | order | invoice | credit-note`
(`credit-note` = MK `sales_bill_credit_note`; `BILL_KINDS` / `isBillKind` in
`types/documents.ts` group invoices + credit notes as the bill-shaped families
that carry a due date and payment state; `DOC_KIND_SLUGS` maps a kind to its URL
segment). Server-side
partner resolution for the portal lives in `lib/portal.ts` (`getSessionPartner`).

| Page | Path | Notes |
|---|---|---|
| Portal (customer) | `/portal` → `/portal/invoices` | B2B shell; own docs only. |
| Invoices / Credit notes / Orders | `/portal/{invoices,credit-notes,orders}` | List as one table card: toolbar (search by number/title + count), proportional grid columns (Issued / Due / Items / Status / Amount); column headings sort (click toggles direction), the **Status heading is the status select**, and clicking a row's status pill filters too; 25-per-page client-side pager. The API returns the complete list, so filtering + paging are purely client-side (`DocumentList` in `documents-shared.tsx`). The invoice **Due** column is the large, urgency-coloured cell (rose + "n days overdue", amber within 7 days). **Credit notes** render with the same bill layout (Due / payment badge / summary strip / payment panel) with refund wording (Credited / Refunded / Open). **Offers are never shown to customers** — no page, nav link, API `type`, or PDF; the whole **Related documents** card is admin-only (`showLinks={false}` in the portal) (`PORTAL_DOC_KINDS` / `isPortalDocKind` in `lib/portal.ts`); admins still browse them under `/documents`. |
| Detail | `/portal/{…}/[mkId]` | Full doc + **Download PDF**. Ownership re-checked. Invoices and orders show a **Billing / Delivery address** card (MK `partner` / `receiver`; no `receiver` = same as billing). Order lines carry a **Shipped** column. |
| No account | `/portal/no-account` | Email not matched to a partner. |

**View portal as a customer (admin impersonation).** `lib/portal-impersonation.ts`:
`POST /api/admin/portal/impersonate { partnerMkId, returnTo }` (preorder- or
documents-admins, `canImpersonate`) sets a signed httpOnly cookie
(`t4a_portal_as`, HMAC with `AUTH0_SECRET`, 4 h) holding the partner id + name +
the admin page to return to. `getPortalViewer()` in `lib/portal.ts` honours it
**only when the session holds an eligible admin role** — the cookie alone grants
nothing — and `getSessionPartner()` then returns that partner for every portal
page/route, so the admin sees exactly the customer's preorders and documents.
Writes made meanwhile are made **as the customer** (a preorder submitted this way
reads exactly as if the customer had submitted it). The root layout passes `viewingAs` to `AppShell`,
which renders `components/viewing-as-banner.tsx` across the portal ("Stop viewing
as customer" → `DELETE /api/portal/impersonation` → back to `returnTo`); the
portal nav shows the customer's name with "viewed by <admin>". Entry points
("View as customer", `components/view-as-customer-button.tsx`): the **Customers**
section (`/customers`, its own nav section, `SECTION_ROLES.customers = ["admin",
"preorder-admin", "customers-admin"]`, `/customers/access` grants the role — the
whole Metakocka directory with each customer's preorder activity across campaigns,
fed by `GET /api/admin/preorder/customers?activity=1`, which the `customers`
section gates together with `/api/admin/portal/*`),
the preorder customer modal and the Documents customer header.
| Customer picker (admin) | `/documents` | Search a partner by name/email/tax. |
| Customer docs (admin) | `/documents/[partnerMkId]` | Offers/Orders/Invoices/Credit notes tabs. |
| Detail (admin) | `/documents/[partnerMkId]/[kind]/[mkId]` | Same detail view, any partner. |

| Proxy route | Methods |
|---|---|
| `/api/portal/documents` | GET (`?type=` — partner from session email) |
| `/api/portal/documents/pdf` | GET (`?kind=&mkId=` — ownership re-checked) |
| `/api/admin/documents` | GET (`?partner=&type=`) |
| `/api/admin/documents/partners` | GET (`?q=`) |
| `/api/admin/documents/pdf` | GET (`?kind=&mkId=`) |

**Notes:** a document's "Additional instructions" (MK `notes_header`) is the
customer-facing text and is what `DocDetail.notes` carries. MK's "Additional
text on document" (`notes`) is internal and is never mapped.

**Security:** `MK_SECRET_KEY`/`MK_COMPANY_ID` stay server-side; the portal APIs
derive the partner from the **session email** (never client input) and re-check
`doc.partner.mkId` on every detail/PDF fetch; cost/purchase-price expansion flags
are never sent. Shared types live in `types/documents.ts` (hand-mirror the MK
responses, like `types/warranty.ts`). Role name is configurable via
`NEXT_PUBLIC_DOCUMENTS_ADMIN_ROLE_NAME` (default `"documents-admin"`, in
`lib/documents-role.ts`).

Required env vars (server-side secrets — the raw Metakocka REST credentials,
distinct from `MK_API_*`):

```
MK_SECRET_KEY=<Metakocka private key>
MK_COMPANY_ID=<Metakocka public company id>
MK_REST_BASE=https://main.metakocka.si   # optional (default)
MK_REPORT_ID_INVOICE=38   # optional — defaults to MK's standard bill report (verified)
MK_REPORT_ID_OFFER=37     # optional — defaults to MK's standard offer report (verified)
MK_REPORT_ID_ORDER=<id>   # optional — no default; set to enable the order PDF button
MK_REPORT_ID_CREDIT_NOTE=<id>  # optional — no default; set to enable the credit note PDF button
MK_REPORT_BACKGROUND_IMAGE_ID=<id>  # optional — pin a specific MK letterhead image
MK_REPORT_LOCALE=en       # optional — force the report language; default: MK picks per document
```

Invoice + offer PDF export work out of the box (report IDs 38 / 37). Orders and
credit notes have no reliable standard report, so their PDF buttons only appear
when `MK_REPORT_ID_ORDER` / `MK_REPORT_ID_CREDIT_NOTE` are set.

**Every PDF is rendered with the company's configured logo + letterhead.** The
REST `/report` endpoint does not inherit the company's print defaults, so
`reportParams()` in `lib/metakocka.ts` always sends
`ADD_ATT_HIDDEN_SHOW_LOGOTIP_IMAGE=true` and
`ADD_ATT_HIDDEN_SHOW_BACKGROUND_IMAGE=true` alongside `REPORT_TYPE=PDF` — the
same `ADD_ATT_HIDDEN_*` attributes MK's own generator uses (dump a report's
full parameter set by appending `&dump_for_report_rest=true` to its URL in the
MK web app). Add further report attributes there, never in the routes.

### Preorder module (`app/preorder/`, `app/portal/preorders/`)

A B2B preorder platform: admins author ONE master campaign (an order sheet of
tabs → groups → product rows with prices and per-tab volume-discount ladders),
configure **markets** (country groups) and **customer overrides**, distribute a
magic invite link, and customers fill the sheet in the portal. On submit a
Metakocka `sales_order` is created **immediately**; staff then adjust the
allocation in Metakocka, and an admin **publishes** the resulting order back to
the customer. Gated by the `preorder` section
(`SECTION_ROLES.preorder = ["admin", "preorder-admin"]`, role name via
`NEXT_PUBLIC_PREORDER_ADMIN_ROLE_NAME` in `lib/preorder-role.ts`).

**Access is invite-only, always.** A customer sees a campaign only with a
`PreorderAccess` grant (created by opening the invite link while logged in as a
matched Metakocka partner, `POST /api/portal/preorder/join`) or an existing
submission (`partnerHasCampaignAccess` in `lib/preorder.ts`). Markets, countries,
customer rules and directory membership never grant access; every portal route
resolves the partner from the **session email** (`getSessionPartner`) and never
from client input.

| Page | Path | Notes |
|---|---|---|
| Campaigns | `/preorder` | List + create; `marketCount` / override badges. |
| VAT rates | `/preorder/vat-rates` | Global per-country VAT table + fallback rate (consumer preorders). Nav entry of the Preorder section. |
| Overview | `/preorder/[id]` | KPIs (incl. In Metakocka / Published / Integration failures), latest preorders. Every campaign page renders the shared `CampaignHeader` (`app/preorder/[campaignId]/campaign-nav.tsx`): a fixed-height title row (back · title + meta · actions) over the `CampaignNav` underline tab strip (Overview · Sheet · Markets & Customers · Preorders · Preview), so the tabs sit on the same pixels everywhere. Page-specific toolbars (sheet settings, preview sheet tabs) live **below** the header, never inside it; small view switchers go in `navExtra` (right end of the tab row). |
| Sheet | `/preorder/[id]/edit` | Builder (autosaves `tabs`). Row eye toggle = **restricted** (not in the default assortment). Re-price also refreshes the price books. |
| Markets & Customers | `/preorder/[id]/markets` | List-based: summary strip + **Customers** view (directory table, company/individual split) and **Markets** view (a full-width priority list — drag to reorder) and **Countries** view (table for assignment) **Markets, customers and countries all open in the large editor modal** (`market-modal.tsx`, `customer-modal.tsx`, `country-modal.tsx` on `components/ui/editor-modal.tsx`; a country shows its market select + a searchable, kind-filtered, paged customer list): header + tab strip — a customer gets Overview · Placement · Pricing & terms · Volume discounts · Assortment, a market gets Market · Pricing & terms · Volume discounts · Assortment — the config tabs are slices of `commercial-config-form.tsx` (`section` prop). See below. |
| Preorders | `/preorder/[id]/submissions` | Full table with stage / Metakocka / visibility columns, filters incl. integration failures. |
| Preorder detail | `/preorder/[id]/submissions/[sid]` | Three panels: **Requested preorder** (frozen snapshot), **Current Metakocka order** (live, compared line by line), **Customer visibility** (Show/Hide order to customer). Unlock detaches the MK order (optionally deletes it). |
| Preview | `/preorder/[id]/preview` | Pick a partner (`?partner=<mkId>` deep link) → the sheet renders their **effective** campaign with an admin-only "Effective configuration" card (market, pricing, assortment, discounts, sources, warnings). "Fill for customer" submits through the same service as the portal. |
| Portal | `/portal/preorders`, `/portal/preorders/[id]` | Customer list + fill page. After submit the page shows registration state (registering / saved-but-not-registered with Retry / processing) and, once published, **"Your confirmed order"** (requested vs confirmed per line, link to `/portal/orders/<mkId>`). |

#### Effective campaign resolver (`lib/preorder-effective.ts`, pure)

`resolveEffectiveCampaign(campaignAdmin, { partnerMkId, countryIso })` applies
**customer rule > market > campaign default** per field and returns an
`EffectiveCampaign` — a `PreorderCampaign`-shaped object (tabs filtered, row
`partnerPrice` overlaid, `tab.tiers` replaced) plus an `effective` provenance
block. Because the shape is unchanged, the pricing engine in `types/preorder.ts`
(`computeTotals`, `rowUnitPrice`, …) and every fill component work on it as-is.
The single server entry point is `loadEffectiveCampaignForPartner(doc, partner)`
in `lib/preorder.ts` (portal GET, submit, admin preview, customer tables) — async,
because it reads the global VAT table (`getVatSettings()`; pass `{ vat }` to reuse
one read).

- **Layers** are `CommercialConfig` objects (`partnerPricelist`, `currency`,
  `deadline`, `note`, `minOrderAmount`, `hiddenIds`, `exposedIds`, `tiersByTab`,
  `vatMode`, `vatRate`, `vatCompanies`).
  An **absent** key inherits; a present key overrides — `tiersByTab: [{tabId, tiers: []}]`
  means "no ladder on this tab", `hiddenIds: []` "hide nothing". Mongoose schemas
  default these to `undefined` on purpose; read layers through `marketView` /
  `customerRuleView`, never `"key" in subdoc` (sub-documents report every path).
- **Market** = the rule's manual `marketId` (a "pin"), else the **first market
  in `campaign.markets` order that matches** the partner — `marketMatches` in
  `types/preorder.ts`: the market's `countries` (if any) contain the partner's
  ISO code AND its `kinds` (if any; `business` = has a tax id, `person`
  otherwise) contain the partner's kind. A market with neither only holds its
  pins. Markets are therefore **ordered by priority** (`POST …/markets
  { order: [ids] }` → `reorderMarkets`; up/down arrows in the Markets panel)
  and a country may sit in several markets. The market modal's **Customers**
  picker edits the pins: saving a market reconciles `customerRules` — added
  customers get `marketId` (an existing rule keeps its other fields), removed
  ones lose it (a rule left empty is deleted). Deleted market on a rule ⇒
  warning + automatic match. Unknown country ⇒ campaign defaults.
- **Country** comes from MK's localized country *name* (get_partner has no ISO
  code): `lib/countries.ts` (`i18n-iso-countries`, 13 locales + MK alias table,
  `foreign_county=false` ⇒ `MK_HOME_COUNTRY`, default `SI`). A rule's `countryIso`
  and the directory's `countryIsoManual` override it.
- **Assortment**: default = rows without `restricted`; each layer removes rows
  whose row / group / tab id is in `hiddenIds` and adds back ids in `exposedIds`
  (exposed beats hidden within a layer). Empty groups/tabs are dropped; the
  submit service validates quantities against the effective rows and drops the
  rest (`dropped` in the response).
- **Pricing**: the sheet's row prices ARE the campaign price list. A layer that
  picks another list uses the campaign's **price book** for it
  (`priceBooks[]`, refreshed by `POST …/price-books/refresh` and the builder's
  Re-price via `lib/preorder-pricebooks.ts`); the book's `net` price replaces
  `partnerPrice` and clears the manual `discountedPrice`; a missing entry keeps
  the sheet price (`priceSource: "fallback"` + warning). No FX: a book currency
  ≠ effective currency is a warning.
- Deadline is display-only; `minOrderAmount` is enforced at customer submit only.

#### Pricing & VAT (`lib/pricing.ts` — the one money service)

Every row carries **two prices**, always shown to everyone: `rrp` (**gross**,
VAT-inclusive consumer price) and `partnerPrice` (**net**, excl. VAT — stored net
since the VAT work; `pickMkListNetPrice` / `pickMkListGrossPrice` in
`lib/metakocka.ts`, `json/product_list` is read with `show_tax_factor`). Who pays
which is decided by the customer's **kind** (`customerKind()`: tax id ⇒
`business`, else `person`):

- **company → partner price, 0% VAT (zero-rated)**; **individual → RRP with the
  country's VAT extracted from it** — never added on top (€100 RRP in SI = 81.97
  net + 18.03 VAT). Volume tiers apply to both, compared with the subtotal in
  the customer's basis.
- The VAT rate of a country resolves **campaign override → global table →
  configured fallback → `missing`** (`resolveVatRate`). Global rates live in the
  `VatSettings` singleton (`models/vat-settings.ts`, `lib/vat-settings.ts`; edited
  at **Preorder → VAT rates** `/preorder/vat-rates`, `GET/PUT
  /api/admin/preorder/vat` — preorder section, like everything else here). Campaign
  overrides are `campaign.vatOverrides[{iso, rate}]` (PATCH on the campaign; the
  Sheet page's **Pricing & VAT** toolbar → `edit/vat-modal.tsx`, Global vs
  Campaign override, Reset to global). **A missing rate is never guessed**: the
  resolver warns `vat-missing:<iso>`, the portal shows an amber banner and
  disables submit, and `saveOrSubmitPreorder` answers `422 vat-missing` (admins
  too; drafts still save). An individual ordering a row without an RRP gets
  `422 rrp-missing`.
- **Layer VAT policy** (`VatPolicy`, the config keys `vatMode` / `vatRate` /
  `vatCompanies`, editable in the market and customer modals under Pricing &
  terms → VAT, `vatPolicyFor` in the resolver, provenance `sources.vat`):
  `vatMode` = `country` (default, the rate chain above) | `exempt` (VAT switched
  off, 0%, source `exempt`) | `fixed` (one `vatRate` for every individual in the
  layer, source `market` / `customer`); `vatCompanies: true` charges VAT to
  companies too — added ON TOP of the net partner price (MK line `price` +
  `tax_factor`). Rule beats market beats campaign default per key.
- The resolver puts a `PricingContext` (`{ kind, basis, countryIso, vat }`) on
  the effective campaign root (`campaign.pricing`, also
  `effective.pricing.ctx`); `campaignFromSnapshot` restores it from the
  snapshot, so every fill component prices the same way with no prop threading
  (`rowUnitPrice(row, basis)`, `computePricedOrder`, `PricingBanner`,
  `VatBreakdown`). The admin builder has no context and prices on the partner
  basis.
- Money is **integer cents** (`toCents`/`splitGross`/`priceLine`/`priceOrder`);
  VAT is split per line and totals are the Σ of the lines (invoice-style — a
  one-shot split of the order total could differ by a cent).
  `PreorderSubmissionTotals.net` stays "payable after tier discounts in the
  customer's basis"; the VAT-net lives in `snapshot.pricing.totals`.

#### Submission → Metakocka lifecycle (`lib/preorder-submit.ts`, `lib/preorder-mk.ts`)

`saveOrSubmitPreorder()` is the one service behind
`POST /api/portal/preorder/submissions` and `POST /api/admin/preorder/submissions`.
Race safety without optimistic concurrency: each write is a single
`findOneAndUpdate` upsert whose filter includes `status: "draft"` on the unique
`(campaignId, partnerMkId)` slot — a locked document makes the filter miss, the
upsert hits the unique index (E11000) ⇒ 409 `locked`. Submit stores the
**commercial snapshot** (`snapshot`: resolved lines with the used unit price,
`rrp` + `partnerPrice`, the frozen per-line `unitNet/unitVat/unitGross` +
`lineNet/lineVat/lineGross`, tiers, market, list, currency, sources — only
ordered rows — plus `snapshot.pricing = { kind, basis, countryIso, vatRate,
vatSource, totals: {net, vat, gross} }`; later VAT/price changes never touch it)
and opens a registration window (`mkOrder.state = "pending"`,
`submitRevision++`).

`registerSalesOrder()` then creates the MK order from the **snapshot** (tier
discount baked into the unit price; the VAT treatment is the snapshot's: a
company's lines go as `price` = net, an individual's as `price_with_tax` = gross
RRP; each line carries the rate as MK's documented `tax_factor` ("0.22"). When a
**Metakocka tax code** is configured for the rate (VAT rates page → optional
codes table, `VatSettings.taxCodes`, frozen into `snapshot.pricing.mkTaxCode` at
submit and re-looked-up at register time) it is sent as `tax` instead — the way
round for lines MK refuses a factor for (the 0 % company line: MK answered
"Extra columns not supported yet on SalesOrder Products" to `tax_factor: "0"`),
`MK_ZERO_TAX_CODE` being the env equivalent for 0 %. `MK_LINE_TAX_MODE=code`
makes a code mandatory for every rate. `GET /api/admin/preorder/vat/mk-tax-codes`
discovers the account's codes from the sheets' product price lists for the
page's dropdown. A snapshot without `pricing` cannot be registered):

1. **Lookup first, every time**: `get_document { doc_type: "sales_order", buyer_order }`
   with the deterministic key `buyerOrderKey(id, rev) = T4A<id>.<rev>` (MK's
   `buyer_order` is `char, 30`). Found ⇒ adopt. Inconclusive (MK down) ⇒ `failed`
   without creating — never create blind.
2. `put_document` (60 s budget — MK's own example takes ~48 s) with `buyer_order`
   and `document_change_log_notes` (= `T4A preorder <submissionId>`). **No
   `extra_column`** — this account rejects it on sales orders ("Extra columns not
   supported yet on SalesOrder Products"). On failure re-lookup once, then `failed`
   + `lastError`.
3. Retries (`POST /api/portal/preorder/submissions/[id]/register` for the
   customer, `POST /api/admin/preorder/submissions/[id]/sales-order` for admins)
   take the lock from `failed` or a `pending` older than
   `REGISTRATION_STALE_MS` (180 s). The MK calls go through an injectable
   `MkOrderPort` (tests use `tests/helpers/mk-fake.ts`).

`mkSalesOrder` (reference `{mkId, countCode, …}`, legacy shape) and `mkOrder`
(sync state) are separate fields on purpose: the reference sub-schema has
`required` fields, so a pending attempt must not live there. **Legacy
submissions** (hand-pushed before this flow) have a reference and no `mkOrder`;
they read as `stage: "registered"` and stay customer-visible — no migration. A
submitted preorder whose snapshot has no `pricing` block (submitted before VAT
support) cannot be registered as is; the admin register route and the customer's
retry call `repriceSubmission()` (`lib/preorder-submit.ts`) first, which
re-resolves the partner's effective campaign for the submitted quantities and
replaces the snapshot (refused once an MK order exists; `{ reprice: true }` on the
admin route forces it). **Campaign-wide publish**: `POST
…/campaigns/[id]/submissions/publish { published, ids? }` runs `publishResult`
over every registered, still-hidden (or shown) submission — the "Show all orders
to customers" / "Hide all" buttons on the Preorders page. **Manual access**:
`POST/DELETE …/campaigns/[id]/customers/[partnerMkId]/access` grants / removes
the invite-link grant by hand (customer modal "Unlock for this customer" / "Lock";
removal refused once a submission exists).

Publication: `POST …/submissions/[id]/publish { published }` re-reads the live
order (a deleted order cannot be published), sets `resultPublishedToCustomer` /
`At` / `By` and remembers `publishedHash` so later MK edits show as "changed
since publish" to admins. **After publication the customer sees the live MK
order** (`readSubmissionOrder`, a 2 s burst guard per order via `cached()` in
`lib/auth0-cache.ts`, and the portal page reads it `fresh` — a reload shows an
edit made in MK; `allocationFromDocument` in
`lib/preorder-snapshot.ts` joins request vs order by product code). Unlocking a
submission with an order requires `detachOrder` in the PATCH: the order moves to
`mkSalesOrderHistory` (optionally `delete_document`) and the next submit uses a
new revision key. Unlock is refused while a registration is in flight.

**Documents filtering** (`lib/preorder-visibility.ts`): the customer's Orders
list, order detail (`app/portal/portal-server.tsx`) and PDF route exclude sales
orders that belong to an unpublished submission (`mkOrder.state = "created"` and
not published) and every detached order — plus any order whose `buyer_order`
matches `PREORDER_MARKER` (`/^T4A[0-9a-f]{24}\.\d{1,2}$/`) that is not a
currently published one (orphans, lost links). The portal list's `total` is the
filtered length. Admin `/api/admin/documents` stays unfiltered and returns a
`preorder` annotation map for badges.

Portal wire views never carry admin data: `toPortalCampaignView` strips markets,
rules, price books, list names and provenance (only `effective.note` /
`minOrderAmount` remain); `toPortalSubmissionView` strips MK ids and error text
and exposes `registration: { state, canRetry }` + `published`.

#### Markets & Customers (`app/preorder/[campaignId]/markets/`)

- `models/mk-customer.ts` — the **customer directory**: every Metakocka partner
  (`partnerMkId` unique, address, `taxId`, resolved `countryIso`, admin
  `countryIsoManual`, `stale`). Filled by `POST /api/admin/preorder/customers/sync`
  (one `get_partner { partner_name: "" }` pull, 120 s budget, `bulkWrite` in
  batches; `MK_PARTNER_SYNC_MODE=sharded` falls back to per-letter queries) and
  kept warm by cheap upserts on join / portal load / picker (`lib/mk-customers.ts`).
  Metakocka is never called on a page render. Rows stamp
  `countryResolverVersion`; bump `COUNTRY_RESOLVER_VERSION` in `lib/countries.ts`
  whenever the resolver learns new spellings and stale rows re-resolve from their
  stored `address.countryRaw` on the next directory read
  (`ensureCountriesResolved`, once per process, no MK call). The resolver also
  sees through decorated register names ("Združeno kraljestvo (UK)",
  "Deutschland / Germany") and maps regions (Canary Islands, Madeira, …) to
  their parent state. (`manualGeo` survives in the schema
  from the retired map; nothing reads it.)
- **Customer kind** — `customerKind()` in `lib/mk-customers.ts` is the one
  definition: a partner with a non-empty MK tax / VAT id is a **company** (legal
  person), anything else an **individual** (natural person). MK's own
  `business_entity` flag is stored but deliberately not consulted. `kind` +
  `taxId` ride on `MkCustomerView`; `?kind=business|person` filters the directory
  (`listMkCustomers`) and the campaign customers route; `countMkCustomersByCountry`
  splits every country into `business` / `person` (`CountryGeo`).
- **No map.** The page is list-first (`markets-client.tsx`): a summary strip (stat
  tiles are shortcuts that push a filter preset into the Customers table), a
  **Customers** view (`CustomersTable` in `tables.tsx`: search incl. VAT id,
  company/individual segment with counts, country/market/access/preorder/override
  selects, Type column) and a **Markets & countries** view (`MarketsPanel` +
  `CountriesTable`: every country with customers or in a market, company /
  individual / unlocked counts, an inline market select per row and checkbox
  bulk-assign — `POST …/markets {assign}`). The market modal picks countries with
  `country-picker.tsx` (searchable, customer counts, warns when a country is moved
  from another market, one-click "add every unassigned European country with
  customers"). Country names for the pickers come from the geo endpoint
  (`allCountryNames()` in `lib/countries.ts`); the client never loads locale tables.
- Config API under `/api/admin/preorder/campaigns/[id]/`: `markets` (GET, PUT
  replace, POST create or `{assign:{marketId,countries}}`), `markets/[marketId]`
  (PATCH, DELETE — rules pointing at it fall back to country), `customers`
  (GET joined rows incl. `?kind=`, `lib/preorder-customers.ts`), `customers/[partnerMkId]`
  (GET detail + effective, PUT upsert rule, DELETE), `customers/geo` (per-country
  aggregates split by kind + `kinds` totals + `countries` names + sync state),
  `effective?partnerMkId=`,
  `price-books/refresh`. Global: `/api/admin/preorder/customers` (directory
  search), `…/customers/sync` (GET status / POST start),
  `…/customers/[partnerMkId]` (GET, PATCH manual country, POST refresh from MK).
- `commercial-config-form.tsx` is the inheritance-aware editor shared by the
  market and customer modals: every field shows the inherited value + source
  badge with **Override / Reset to inherited**; the inherited baseline is computed
  client-side with the same pure resolver (campaign without that layer).

Tests: `npm test` (vitest; `server-only` is stubbed, Mongo tests use
`mongodb-memory-server`) — pricing/VAT service (cents, splits, rate priority,
line + order pricing), VAT settings, resolver precedence / assortment / pricing
/ tiers / pricing context, snapshot immutability incl. frozen VAT, countries,
submit idempotency & race, B2B/B2C MK payloads, vat-missing / rrp-missing
blocks, MK failure/retry/adoption, publication, Documents visibility, markets
API, directory upserts. `npm run typecheck` = `tsc --noEmit`.

Optional env vars: `MK_HOME_COUNTRY` (default `SI`), `MK_PARTNER_SYNC_MODE`
(`all` | `sharded`), `MK_DEFAULT_TAX_CODE` (MK tax code stored on rows for
reference, default `EX4`), `MK_DEFAULT_VAT_RATE` (product VAT % used only to
gross/net MK list prices lacking a tax factor), `MK_ZERO_TAX_CODE` (a `tax` code for
zero-rated lines instead of `tax_factor: 0`), `MK_LINE_TAX_MODE` (`code` = a
configured tax code is mandatory per rate; default: `tax_factor`, codes optional),
`PRODUCT_API_BASE` / `PRODUCT_API_KEY` (catalogue used by the sheet builder).

### API Routes (`app/api/admin/`)

| Route | Methods | Notes |
|---|---|---|
| `/users` | GET, POST | List all non-dev users with usage+limit; create a new user (requires `name`, `username`, `email`, `password`) |
| `/users/[id]` | GET, PATCH, DELETE | Single user detail, update, delete |
| `/users/[id]/roles` | GET, PATCH | Get or update roles assigned to a user (PATCH accepts `{ assign: string[], remove: string[] }`) |
| `/users/[id]/limit` | GET, POST, DELETE | Manage per-user spending limits |
| `/users/[id]/send-password-reset` | POST | Trigger Auth0 password reset email |
| `/roles` | GET, POST | List Auth0 roles (dev role excluded); create new role |
| `/roles/[id]` | PATCH, DELETE | Update/delete a role |
| `/roles/[id]/permissions` | GET, POST, DELETE | List, add, or remove Auth0 role permissions (scopes) |
| `/resource-servers` | GET | Returns scopes for `https://api.time-4-action.com` only; name/identifier not exposed to UI |
| `/stats` | GET | Dashboard KPIs: total cost, active users, conversations today, cost by user/model |
| `/usage` | GET | Full token-level usage table per user per model |

### Environment Variables

Required in `.env.local`:

```
AUTH0_SECRET
AUTH0_ISSUER_BASE_URL
AUTH0_CLIENT_ID
AUTH0_CLIENT_SECRET
AUTH0_MGMT_CLIENT_ID
AUTH0_MGMT_CLIENT_SECRET
AUTH0_DB_CONNECTION          # Auth0 database connection name for user creation
MONGODB_URI
```

Optional:
```
NEXT_PUBLIC_APP_NAME         # Browser tab title (default: "Admin")
NEXT_PUBLIC_AI_ROLE_NAME     # Name of the AI-access role (default: "AI User")
NEXT_PUBLIC_DEV_ROLE_NAME    # Name of the dev role to hide (default: "dev")
NEXT_PUBLIC_WARRANTY_ADMIN_ROLE_NAME  # Role whose members are warranty assignees (default: "warranty-admin")
NEXT_PUBLIC_PARTNERS_ADMIN_ROLE_NAME  # Role that grants the Partners section (default: "partners-admin")
NEXT_PUBLIC_PARTNER_ROLE_NAME         # Auth0 role that identifies a partner (default: "export")
NEXT_PUBLIC_AUTOMATION_ADMIN_ROLE_NAME # Role that grants the Automation section (default: "automation-admin")
NEXT_PUBLIC_BUILDER_ADMIN_ROLE_NAME  # Role that grants the Builder section (default: "builder-admin")
NEXT_PUBLIC_DOCUMENTS_ADMIN_ROLE_NAME # Role that grants the Documents browse section (default: "documents-admin")
NEXT_PUBLIC_PREORDER_ADMIN_ROLE_NAME  # Role that grants the Preorder section (default: "preorder-admin")
NEXT_PUBLIC_CUSTOMERS_ADMIN_ROLE_NAME # Role that grants the Customers section on its own (default: "customers-admin"; preorder-admins have it implicitly)
MK_HOME_COUNTRY              # ISO-2 home country for domestic MK partners without an address country (default: SI)
MK_PARTNER_SYNC_MODE         # Customer directory sync strategy: all (default) | sharded
AUTH0_BASE_URL               # Production base URL (set by docker-compose)
```

Partners module also requires `PARTNER_API_BASE` and `PARTNER_API_TOKEN` (both
server-side secrets — see the Partners module section above).

Automation module requires `MK_API_BASE` and `MK_API_TOKEN` (server-side
secrets — see the Automation module section above). Its section is gated by the
`automation-admin` role (or `admin`).

B2B Customer Portal + Documents module requires `MK_SECRET_KEY` and
`MK_COMPANY_ID` (the raw Metakocka REST credentials — **not** `MK_API_*`);
`MK_REST_BASE`, `MK_REPORT_ID_INVOICE`, `MK_REPORT_ID_OFFER` are optional. See the
B2B Customer Portal module section above.
