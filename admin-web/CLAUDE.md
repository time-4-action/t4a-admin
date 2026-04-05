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
```

## Architecture Overview

This is a **Next.js 16 App Router** admin dashboard for managing users, roles, and AI usage costs. It is deployed as a standalone Docker container on port 3005.

### Authentication & Authorization

All routes except `/forbidden` and `/unauthorized` are protected by `middleware.ts`, which delegates to `lib/proxy.ts`. The middleware:
1. Runs the Auth0 SDK middleware for session management.
2. Verifies the user has the `"admin"` role by decoding the Auth0 ID token JWT directly (custom claims under `https://time-4-action.com/roles`). The Auth0 `userinfo` endpoint does not forward custom claims, so the raw JWT payload must be parsed manually.
3. Redirects unauthenticated users to `/auth/login` and non-admin users to `/forbidden`.

Auth0 session client: `lib/auth.ts` (singleton `auth0`).  
Auth0 Management API client: `lib/mgmt.ts` (singleton `ManagementClient`, lazy-initialized).

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

### Role Names

`lib/ai-role.ts` exports two configurable role names:
- `AI_ROLE_NAME` (env `NEXT_PUBLIC_AI_ROLE_NAME`, default `"AI User"`) — the role that grants access to the AI product.
- `DEV_ROLE_NAME` (env `NEXT_PUBLIC_DEV_ROLE_NAME`, default `"dev"`) — internal development role that is hidden from the admin UI.

The dev role is filtered out from the roles list returned by `GET /api/admin/roles` and cannot be created via the API.

### Currency

All costs are stored in USD. `lib/currency-context.tsx` provides a client-side `CurrencyProvider` that lets the user toggle between USD and EUR display. The EUR/USD rate is a constant in `lib/currency.ts`.

### API Routes (`app/api/admin/`)

| Route | Methods | Notes |
|---|---|---|
| `/users` | GET, POST | List all non-dev users with usage+limit; create a new user |
| `/users/[id]` | GET, PATCH, DELETE | Single user detail, update, delete |
| `/users/[id]/roles` | GET, POST, DELETE | Manage roles assigned to a user |
| `/users/[id]/limit` | GET, POST, DELETE | Manage per-user spending limits |
| `/users/[id]/send-password-reset` | POST | Trigger Auth0 password reset email |
| `/roles` | GET, POST | List/create Auth0 roles (dev role excluded) |
| `/roles/[id]` | PATCH, DELETE | Update/delete a role |
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
AUTH0_BASE_URL               # Production base URL (set by docker-compose)
```
