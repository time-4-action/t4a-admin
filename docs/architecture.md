# Architecture

Technical architecture of the admin dashboard.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui (New York style) |
| Charts | Recharts |
| Auth | Auth0 (NextJS SDK v4) |
| Database | MongoDB (Mongoose) |
| Deployment | Docker (standalone) |

## Project Structure

```
├── app/
│   ├── api/admin/          # REST API routes
│   │   ├── roles/          # Role CRUD + permissions
│   │   ├── users/          # User CRUD + limits + roles
│   │   ├── stats/          # Dashboard KPIs
│   │   ├── usage/          # Token usage data
│   │   └── resource-servers/  # Auth0 API scopes
│   ├── dashboard/          # Main dashboard with charts
│   ├── users/              # User management pages
│   ├── roles/              # Access type management
│   ├── usage/              # Usage & cost reports
│   ├── settings/           # App settings
│   ├── ai/                 # AI-specific views
│   ├── forbidden/          # 403 page
│   └── unauthorized/       # 401 page
├── components/
│   ├── ui/                 # shadcn/ui primitives
│   ├── nav.tsx             # Navigation sidebar
│   └── *-dialog.tsx        # Feature dialogs
├── lib/
│   ├── auth.ts             # Auth0 session client
│   ├── mgmt.ts             # Auth0 Management API client
│   ├── mongodb.ts          # Mongoose connection
│   ├── proxy.ts            # Auth middleware logic
│   ├── ai-role.ts          # Role name configuration
│   ├── dev-users.ts        # Dev user filtering
│   ├── currency.ts         # USD/EUR conversion
│   └── currency-context.tsx # Currency toggle provider
├── models/
│   ├── user-usage.ts       # Per-user token/cost data
│   ├── user-limit.ts       # Spending limits
│   └── conversation.ts     # Conversation counts
├── docs/                   # Documentation
├── Dockerfile              # Multi-stage production build
├── docker-compose.yaml     # Container orchestration
└── middleware.ts            # Auth0 + admin gate
```

## Data Sources

The dashboard merges data from two external systems:

### Auth0 Management API (`lib/mgmt.ts`)

- User identities and profiles
- Role assignments
- Password reset triggers
- Resource server scopes (API permissions)

The Management API client is a singleton, lazy-initialized on first use.

### MongoDB (`lib/mongodb.ts`)

- AI token usage and costs per user/model
- User spending limits and caps
- Conversation counts

The Mongoose connection is cached on `global._mongooseConn` to survive Next.js hot-reload in development.

## MongoDB Collections

| Model | Collection | Purpose |
|-------|-----------|---------|
| `UserUsage` | `userusages` | Per-user, per-model token counts and cost. Unique index on `(userId, modelId)` |
| `UserLimit` | `userlimits` | Per-user spending cap with period and current spend |
| `Conversation` | `conversations` | One doc per conversation; used for daily count on dashboard |

## API Routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/admin/users` | GET, POST | List users with usage; create user |
| `/api/admin/users/[id]` | GET, PATCH, DELETE | User detail, update, delete |
| `/api/admin/users/[id]/roles` | GET, PATCH | Manage user role assignments |
| `/api/admin/users/[id]/limit` | GET, POST, DELETE | Manage spending limits |
| `/api/admin/users/[id]/send-password-reset` | POST | Trigger password reset email |
| `/api/admin/users/[id]/conversations` | GET | User conversation data |
| `/api/admin/roles` | GET, POST | List/create roles (dev role excluded) |
| `/api/admin/roles/[id]` | PATCH, DELETE | Update/delete role |
| `/api/admin/roles/[id]/permissions` | GET, POST, DELETE | Manage role permissions |
| `/api/admin/resource-servers` | GET | List API scopes |
| `/api/admin/stats` | GET | Dashboard KPI aggregations |
| `/api/admin/usage` | GET | Full usage breakdown |

## Dev User Filtering

Users with the `dev` role are:
- Hidden from all user lists
- Aggregated under a synthetic "Development" entry in cost reports
- Filtered efficiently with 2 Auth0 API calls regardless of total user count

## Currency Display

All costs are stored in USD internally. The `CurrencyProvider` context allows toggling between USD and EUR display. The conversion rate is a constant in `lib/currency.ts`.

## UI Patterns

### Loading States

All loading states use **shimmer skeletons** (CSS class `.skeleton` in `globals.css`):
- Skeleton elements match the real layout dimensions
- Staggered animation delays create a cascading wave effect
- Buttons show `<Loader2>` spinner during operations

### Access Management

Auth0 roles are presented as "Access Types" in the UI. The assign page supports:
- **Single user**: drag-and-drop two-column UI using `@dnd-kit/core`
- **Multiple users**: batch view with count badges and bulk grant/remove
