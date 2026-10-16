# Dependencies

Everything t4a-admin needs to build, run and deploy, and what each part of the
app stops doing without it. Env var details and module internals are in
[CLAUDE.md](../CLAUDE.md); Auth0 tenant setup is in
[setup-guide.md](setup-guide.md); the pipeline is in [deployment.md](deployment.md).

## Runtime and tooling

| Dependency | Version | Used for |
|---|---|---|
| Node.js | 20+ (CI and the Docker image use 20) | Running and building the app |
| npm | 10+ | `npm install` / `npm ci` |
| Docker | — | Local production build (`docker compose up --build`), production container |
| MongoDB binary | downloaded by `mongodb-memory-server` on the first `npm test` | Integration tests only; no database needs to be running |

## Required services

The app does not start (or nobody can log in) without these.

| Service | Env vars | Used for |
|---|---|---|
| **Auth0** — web application | `AUTH0_SECRET`, `AUTH0_DOMAIN`, `AUTH0_ISSUER_BASE_URL`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_BASE_URL` | Login and sessions for admins and portal customers (passwordless OTP). Roles come from the post-login Action claim `https://time-4-action.com/roles`. |
| **Auth0** — Management API (machine-to-machine app) | `AUTH0_MGMT_CLIENT_ID`, `AUTH0_MGMT_CLIENT_SECRET`, `AUTH0_DB_CONNECTION` | Users, roles, permissions, password resets, role-member lookups (warranty assignees, partners, dev users) |
| **MongoDB** | `MONGODB_URI` | AI usage and limits, conversations, builder presets, preorder campaigns / submissions / access, customer directory, portal agents, VAT settings |

## Services per module

Without these the app still runs; only the listed pages / actions fail.

| Service | Env vars | Modules that need it |
|---|---|---|
| **Metakocka REST API** (`main.metakocka.si`) | `MK_SECRET_KEY`, `MK_COMPANY_ID`, `MK_REST_BASE` (defaults to `https://main.metakocka.si`), optional `MK_REPORT_ID_*`, `MK_REPORT_*`, `MK_HOME_COUNTRY`, `MK_PARTNER_SYNC_MODE`, `MK_*_TAX_*`, `MK_LINE_TAX_MODE` | Customer portal, Documents, Customers, Preorder (partners, documents, PDFs, price lists, products, **creates sales orders**) |
| **t4a-partner-portal API** (`api.time-4-action.com`) | `PARTNER_API_BASE`, `PARTNER_API_TOKEN` (= the portal's `PARTNER_ADMIN_TOKEN`) | Partners (activity, notes, catalogue sync) |
| **Product catalogue** (served by the partner-portal API) | `PRODUCT_API_BASE` (defaults to `https://api.time-4-action.com`), `PRODUCT_API_KEY` (= the portal's `WEBHOOK_API_KEY`) | Preorder sheet builder (search, images, descriptions, families) |
| **patrik-warranty-form** | `WARRANTY_API_BASE`, `INTERNAL_ADMIN_TOKEN` | Warranty (claims, settings, audit log) |
| **t4a-mk-automation** (`mkauto.time-4-action.com`) | `MK_API_BASE`, `MK_API_TOKEN` | Automation (status, schedules, run now) |
| **Hetzner Object Storage** (S3, same bucket as the warranty form) | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_PUBLIC_BASE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Preorder row / group image uploads (route answers 503 without them) |
| **Portal domain** | `PORTAL_BASE_URL` (defaults to `https://b2b.time-4-action.com`) | Preorder invite links |

The Builder module needs no backend service; its renderer is bundled at
`public/patrik-components.js`.

## Build and deployment

| Dependency | Used for |
|---|---|
| GitHub Actions | `check` on every PR; build + deploy + verify on push to `main` |
| GitHub Container Registry (`ghcr.io/time-4-action/t4a-admin`) | Image storage; pushed and pulled with the workflow's `GITHUB_TOKEN` |
| Organization secrets `PROD_DEPLOY_HOST`, `PROD_DEPLOY_SSH_KEY`, `PROD_DEPLOY_FINGERPRINT` | SSH to the production VM |
| Repository variables `NEXT_PUBLIC_AI_ROLE_NAME`, `NEXT_PUBLIC_DEV_ROLE_NAME`, `NEXT_PUBLIC_EUR_USD_RATE` | Baked into the client bundle at build time |
| Production VM `t4a-t2` | Runs the container on port 3005 from `/data/stack/apps/time-4-action/admin` (`deploy/docker-compose.yaml` + `.env.local`), behind nginx at `https://admin.time-4-action.com` |

## Development environment (planned)

Nothing run in development may change production. The target setup:

| Dependency | Production | Development |
|---|---|---|
| Auth0 | Production tenant | Dev tenant (`t4a-infra`: `npm run auth0:sync:prod-to-dev`) |
| MongoDB | Production database | Dev database (`t4a-infra`: `npm run mongo:sync:prod-to-dev`) or a local container |
| Metakocka | `main.metakocka.si` | `devmainsi.metakocka.si` with its own company id + secret key |
| Partner portal / product catalogue | `api.time-4-action.com` | Dev instance (local `npm run dev`, or a dev deployment) |
| Warranty | Production service | Dev instance, or left empty |
| mk-automation | `mkauto.time-4-action.com` | Dev instance pointing at devmainsi, or left empty |
| S3 | Production bucket | Dev bucket, or left empty |
| Portal links | `https://b2b.time-4-action.com` | The dev admin's own URL |
| Server | `t4a-t2`, `https://admin.time-4-action.com` | Separate dev VM, `https://dev-admin.time-4-action.com` |
| CI/CD | Push to `main` → `production` environment | Push to `dev` → `development` environment (`DEV_DEPLOY_*` secrets) |

Planned safeguard: only production sets `APP_ENV=production`; anywhere else
the app refuses to start, and refuses each outbound call, when a setting points
at a production host. The production-host defaults of `MK_REST_BASE` and
`PRODUCT_API_BASE` go away.
