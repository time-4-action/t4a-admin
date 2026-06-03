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
| Email settings | `/warranty/settings` | Recipients chip input + customer/admin email subject, intro, outro, and per-field toggles. Persists to the warranty service's `warranty_settings` Mongo collection. |

| Proxy route | Methods |
|---|---|
| `/api/warranty/submissions` | GET |
| `/api/warranty/submissions/[submissionId]` | GET, PATCH |
| `/api/warranty/settings` | GET, PUT |
| `/api/warranty/assignees` | GET |

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
AUTH0_BASE_URL               # Production base URL (set by docker-compose)
```
