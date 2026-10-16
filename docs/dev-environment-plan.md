# Development environment plan

Plan for giving every time-4-action app a development copy with its own CI/CD,
so changes are tested on a dev server before they reach production.
Status: **design only — nothing below is built yet.**

See also [dependencies.md](dependencies.md) for everything t4a-admin depends on.

## Goal

**Nothing that runs in development may change production.** No dev app may
write to a production database, production Metakocka, a production service, a
production bucket, or send real customer emails.

## The idea in short

1. **A separate dev server** runs a dev copy of every app.
2. **Every app gets a `dev` branch.** Merging into `dev` deploys to the dev
   server; merging `dev` → `main` deploys to production (as today).
3. **Dev apps only talk to dev things**: dev Auth0 tenant, dev MongoDB,
   `devmainsi.metakocka.si`, the other apps' dev copies.
4. **A safety lock in every app** refuses production addresses unless the app
   knows it is the live server.

```
feature/fix branch
      │  PR (check: typecheck + tests + build)
      ▼
     dev ──push──► build image ──► deploy to DEV server  ──► health check dev URL
      │
      │  PR dev → main (when a batch is tested on dev)
      ▼
     main ──push──► build image ──► deploy to PROD server ──► health check prod URL
```

## Dev and production targets

| Thing | Production | Development |
|---|---|---|
| Server | `t4a-t2` | Separate dev VM |
| Auth0 | Production tenant | Dev tenant (`t4a-infra`: `npm run auth0:sync:prod-to-dev`) |
| MongoDB | Production database | Dev database (`t4a-infra`: `npm run mongo:sync:prod-to-dev`) |
| Metakocka | `main.metakocka.si` | `devmainsi.metakocka.si` (own company ids + secret keys) |
| S3 | Production bucket | Dev bucket, or empty (uploads disabled) |
| Email (SMTP) | Real sending | Test mailbox / catcher, or empty — never real customers |
| Monitoring heartbeats | Better Stack | Empty |

Dev domains follow production: `dev-<name>.time-4-action.com`
(e.g. `dev-admin.time-4-action.com`, `dev-mkauto.time-4-action.com`,
`dev-api.time-4-action.com`).

## The safety lock (same in every app)

- Only the production server sets `APP_ENV=production` in its env file. The dev
  server and laptops never do. (`NODE_ENV` cannot be used — production builds
  set it everywhere.)
- Each app has a list of production hosts (`main.metakocka.si`,
  `api.time-4-action.com`, `mkauto.time-4-action.com`, the production Auth0
  tenant, the production MongoDB host, …).
- Without `APP_ENV=production`:
  - **at startup** the app refuses to start if any setting points at a
    production host, and prints which settings;
  - **before every outbound call** it checks again (backup).
- No setting may silently default to a production address. Empty means "not
  configured", never "production".
- Add `APP_ENV=production` to the production env file **in the same change**
  that adds the lock, or production refuses to start.

## Which app first — order

Start with the app that depends on the least, so the pattern (server, pipeline,
lock) is learned on the simplest one, then copy it.

| # | App | Depends on | Notes |
|---|---|---|---|
| 1 | **t4a-mk-automation** | Metakocka (T4A + CREAGLOBE), own SQLite file, Better Stack heartbeat | Almost only Metakocka. No database to copy. Riskiest to test against production ("Run now" really syncs into CREAGLOBE). |
| 2 | **t4a-partner-portal** (API) | Shopify, Auth0, MongoDB, product catalogue, … | The admin's preorders need its product catalogue. Most connected — check its full `.env` first. |
| 3 | **patrik-warranty-form** | MongoDB, S3, Google Sheets, SMTP, Sentry, Mapbox, GA | Sends real emails — SMTP must point at a test mailbox in dev. Google Sheet needs a dev copy or must be off. |
| 4 | **t4a-admin** | Auth0, MongoDB, Metakocka + all three apps above | Depends on everything, so last. Full design below. |

Until an app has its dev copy, leave its settings **empty** on the dev server —
only the pages that use it stop working there.

## Dev server setup (once)

- [ ] Create the VM (AlmaLinux, like `t4a-t2`).
- [ ] Install Docker, nginx, `curl`; create a `deploy` user in the `docker` group.
- [ ] Generate an SSH key for CI; put the public half in `deploy`'s `authorized_keys`.
- [ ] Note the host key fingerprint (`ssh-keygen -lf /etc/ssh/ssh_host_ecdsa_key.pub` — ECDSA, not ED25519).
- [ ] GitHub organization secrets: `DEV_DEPLOY_HOST`, `DEV_DEPLOY_SSH_KEY`, `DEV_DEPLOY_FINGERPRINT`.
- [ ] Optional: protect dev sites in nginx (basic auth or IP allowlist).

## Step by step: app 1 — t4a-mk-automation

**Before starting, check:**

- [ ] **devmainsi has BOTH companies** (T4A and CREAGLOBE). The app syncs
      T4A → CREAGLOBE, so it needs for each: company id, secret key and
      warehouse ids (`MK_SECRET_KEY_T4A`, `MK_COMPANY_ID_T4A`,
      `MK_T4A_WAREHOUSE_ID`, `MK_SECRET_KEY_CREAGLOBE`,
      `MK_COMPANY_ID_CREAGLOBE`, `MK_CREAGLOBE_WAREHOUSE_ID_T4A`, …).
      If only T4A exists there, this app cannot run in dev yet.
- [ ] **`config/config.json`** holds a Metakocka `baseUrl` + paths (and a
      Google Drive section from the retired ProMode source). Make sure dev reads
      devmainsi from there too, not only from `.env`.
- [ ] **`BETTER_STACK_WH_SYNC_HEARTBEAT` stays empty in dev**, or dev runs
      report as production runs.
- [ ] It runs on a **cron schedule**, so the dev copy syncs by itself — fine
      against devmainsi, which is why the lock matters.

**Build it:**

1. [ ] Get devmainsi credentials + warehouse ids for T4A and CREAGLOBE.
2. [ ] Add the safety lock (refuse `main.metakocka.si` and a set heartbeat
       without `APP_ENV=production`); add `APP_ENV=production` on production.
3. [ ] Create the `dev` branch from `main`.
4. [ ] CI/CD: push to `dev` → build image `:dev-<sha>` → deploy to the dev
       server (environment `development`, `DEV_DEPLOY_*` secrets).
5. [ ] Dev server: folder, compose file, dev `.env`, nginx + certificate for
       `dev-mkauto.time-4-action.com`, DNS record.
6. [ ] Test: run a sync, check the change lands in devmainsi CREAGLOBE and
       nothing changed in production.

## Design: t4a-admin (app 4)

**Pipeline** — same workflow file and jobs (`check` → `deploy` → `verify`) as
today; values depend on the branch:

| | `dev` branch | `main` branch (unchanged) |
|---|---|---|
| GitHub environment | `development` | `production` |
| Image tags | `t4a-admin:dev-<sha>`, `:dev` | `t4a-admin:<sha>`, `:latest` |
| SSH secrets | `DEV_DEPLOY_*` | `PROD_DEPLOY_*` |
| Server folder | `/data/stack/apps/time-4-action/admin` on the dev VM | same path on `t4a-t2` |
| Public check | `https://dev-admin.time-4-action.com/healthz` | `https://admin.time-4-action.com/healthz` |
| Concurrency group | `deploy-dev` | `deploy-prod` |

- `NEXT_PUBLIC_*` are baked in at build time, so each environment builds its
  own image; they become **environment-scoped** GitHub variables.
- Protect the `production` environment so only `main` deploys to it;
  `development` only from `dev`.

**Dev `.env.local` on the dev server:**

| Setting | Dev value |
|---|---|
| `AUTH0_*` | Dev tenant; add callback `https://dev-admin.time-4-action.com/auth/callback` + logout URL there |
| `AUTH0_BASE_URL` | `https://dev-admin.time-4-action.com` |
| `MONGODB_URI` | Dev database |
| `MK_REST_BASE`, `MK_COMPANY_ID`, `MK_SECRET_KEY` | devmainsi |
| `PARTNER_API_BASE`, `PRODUCT_API_BASE` + tokens | `dev-api…` once it exists, else empty |
| `WARRANTY_API_BASE` + token | dev warranty once it exists, else empty |
| `MK_API_BASE` + token | `https://dev-mkauto.time-4-action.com` |
| `S3_*` | Dev bucket, or empty |
| `PORTAL_BASE_URL` | `https://dev-admin.time-4-action.com` (invite links must not point at production) |
| `APP_ENV` | **not set** |

**Changes in this repo:**

1. Workflow: deploy on push to `dev` (table above).
2. `deploy/docker-compose.dev.yaml` with the dev URL.
3. Safety lock (`lib/env-guard.ts`, startup check, check in every outbound
   client: `callWarranty`, `callPartnerPortal`, `callMkAutomation`,
   `callMetakocka`, product API, S3, MongoDB, Auth0 management); remove the
   production defaults of `MK_REST_BASE` and `PRODUCT_API_BASE`.
4. `APP_ENV=production` in the production `.env.local` — same release.
5. Docs: `deployment.md`, CLAUDE.md git workflow, `.env.example` for dev.
6. Create the `dev` branch; feature PRs go to `dev` from then on.

## Running an app on a laptop

All apps are plain Node apps: one terminal per app, `npm run dev` in its
folder, each on its own port (they all default to 3000):

| App | Folder | Command |
|---|---|---|
| t4a-admin | `t4a-admin` | `npm run dev` (port 3000) |
| Partner portal API | `t4a-partner-portal/t4a-partner-portal-api` | `set PORT=4000` then `npm run dev` |
| Warranty | `patrik-warranty-form` | `npm run dev -- -p 3001` |
| mk-automation | `t4a-mk-automation` | `npm run dev` (port from its config) |

Point the admin's `.env.local` at `http://localhost:<port>` for the apps you
started (or at their `dev-…` URLs once deployed); leave the others empty.
Only start an app on the day you work on it.

## Open questions

- [ ] Who builds the dev VM (`t4a-t2` looks hand-built; `t4a-infra` `docker/`
      and `nginx/` are still stubs)?
- [ ] Dev data refresh: refresh the dev database from production regularly (it
      then holds real customer data) or only by hand?
- [ ] Dev site access: open, or basic auth / IP allowlist?
- [ ] Does devmainsi have both T4A and CREAGLOBE?
