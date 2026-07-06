# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Build for production (outputs standalone bundle)
npm run start    # Run the production build
```

No linter or test runner is configured — there is no `lint` or `test` script in `package.json`.

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
3. Redirects unauthenticated users to `/auth/login` and non-admin users to `/forbidden`.

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

| Page | Path | Notes |
|---|---|---|
| Warehouse & Products | `/automation` | Two cards (Warehouse sync, Products sync): status, plain-English schedule with an inline cron editor (presets + live `humanizeCron` preview), next/last run, **Run now**, and a combined run-history table. Polls while a sync is running. |

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

The `<script src="…">` line written into every **generated snippet** is a
**hardcoded** constant `BUILDER_SCRIPT_URL` in `lib/builder-role.ts` (the
canonical hosted renderer at
`https://www.patrikinternational.com/assets/added_js_files/patrik-components.js`)
— not env-configurable. Role name is configurable via
`NEXT_PUBLIC_BUILDER_ADMIN_ROLE_NAME` (default `"builder-admin"`, also in
`lib/builder-role.ts`). To add a new section builder: bundle its renderer logic
into `patrik-components.js`, then add a `/builder/<name>` page that drives
`BuilderShell` (see the two existing builders as templates).

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
AUTH0_BASE_URL               # Production base URL (set by docker-compose)
```

Partners module also requires `PARTNER_API_BASE` and `PARTNER_API_TOKEN` (both
server-side secrets — see the Partners module section above).

Automation module requires `MK_API_BASE` and `MK_API_TOKEN` (server-side
secrets — see the Automation module section above). Its section is gated by the
`automation-admin` role (or `admin`).
