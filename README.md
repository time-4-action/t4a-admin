# PATRIK Business Platform

Admin dashboard and B2B customer portal for time-4-action, built with Next.js 16
(App Router), Auth0 and MongoDB, and deployed as a standalone Docker container.

## What it does

**Admin** (Auth0 `admin` role, plus per-section roles):

- **Users & Access** — Auth0 users, access types (roles), permissions, assignments
- **AI** — usage, costs and per-user spending limits
- **Warranty** — claims from the warranty service
- **Partners** — partner-portal activity and catalogue sync
- **Automation** — the Metakocka warehouse / products sync service
- **Builder** — snippet builders for the marketing website sections
- **Documents & Customers** — any customer's Metakocka documents, portal agents
- **Preorder** — campaign sheets, markets, customer pricing, VAT, Metakocka orders

**Customer portal** (`/portal`, no role needed): customers sign in with their
B2B email and see their own invoices, credit notes, orders and preorders.

## Development

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest
npm run typecheck    # tsc --noEmit
```

Configuration lives in `.env.local` (never committed). The required and
optional variables are listed in [CLAUDE.md](CLAUDE.md#environment-variables);
the Auth0 tenant setup is in [docs/setup-guide.md](docs/setup-guide.md).

## Deployment

Every pull request runs typecheck, tests and a build. A push to `main` builds
the image, pushes it to GHCR and rolls it out — see
[docs/deployment.md](docs/deployment.md).

```bash
docker compose up --build   # local production build on port 3005
```

## Repository layout

| Path | Contents |
|---|---|
| `app/` | Pages and API routes (`app/api/*`) |
| `components/` | Shared UI (`components/ui` = shadcn/ui primitives) |
| `lib/` | Server and client services (Auth0, MongoDB, Metakocka, pricing, …) |
| `models/` | Mongoose schemas |
| `types/` | Shared types |
| `tests/` | vitest suites |
| `public/patrik-components.js` | The website section renderer used by the Builder |
| `mk-docs/` | Metakocka REST API reference |
| `api-docs/` | Partner portal API reference |
| `docs/` | Setup and deployment guides, Auth0 email template |
| `deploy/` | Production compose file for the server |

[CLAUDE.md](CLAUDE.md) is the detailed architecture reference for every module.

## License

Private — all rights reserved.
