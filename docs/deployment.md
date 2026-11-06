# Deployment

`.github/workflows/deploy.yml` (workflow `ci`) runs `check` → `deploy` → `verify`.

**check** runs on every pull request and every push to `main`: `npm ci`,
`npm run typecheck`, `npm test` (MongoDB from mongodb-memory-server) and
`npm run build`. A newer push to a pull request cancels its running check; runs
on `main` are queued, so pushes deploy strictly in order.

**deploy** runs only on `main` after a green check, one at a time. It builds the
image on GitHub Actions with the commit SHA baked in as `APP_VERSION`, pushes
`ghcr.io/time-4-action/t4a-admin:<sha>` and `:latest` to GitHub Container
Registry, then SSHes to the VM as `deploy` and, in
`/data/stack/apps/time-4-action/admin`:

1. records the image the running `t4a-admin` container uses;
2. logs in to `ghcr.io` with the job's own `GITHUB_TOKEN` (valid only while the
   job runs; logged out again on exit, so the VM stores no registry
   credential), `docker compose pull t4a-admin` (three attempts) and `docker compose up -d`
   with `APP_IMAGE` exported to the new SHA;
3. waits up to 60 s for `http://127.0.0.1:3005/healthz` to answer 200;
4. checks the container reports `APP_VERSION` equal to the commit SHA.

If 3 or 4 fails it prints the logs, rolls back to the recorded image and fails
the run. **verify** then requests `/healthz` on the public URL
(`https://admin.time-4-action.com`, override with the `PRODUCTION_URL`
repository variable).

`/healthz` is excluded from the auth proxy (`middleware.ts`) and does not touch
MongoDB, so a database outage never triggers a rollback.

The deploy only swaps images. `.env.local` and `docker-compose.yaml` on the
server are edited by hand; the server copy of the compose file is
`deploy/docker-compose.yaml` (the root one is for local builds). To go back to
an older release, re-run that commit's workflow, or on the server:
`export APP_IMAGE=ghcr.io/time-4-action/t4a-admin:<sha> && docker compose up -d`
(a `docker login ghcr.io` first if the package is private).

## GitHub settings

The image lives in GHCR as `ghcr.io/time-4-action/t4a-admin`. Pushing and
pulling use the workflow's `GITHUB_TOKEN` (`packages: write` on the deploy job),
so there is no registry secret. The `org.opencontainers.image.source` label in
the Dockerfile links the package to this repository.

Organization secrets (shared with the other time-4-action repos on this VM):

| Secret                         | Value |
| ------------------------------ | ----- |
| `PROD_DEPLOY_HOST`                  | The VM's hostname or IP |
| `PROD_DEPLOY_SSH_KEY`               | Private key whose public half is in `deploy`'s `authorized_keys` |
| `PROD_DEPLOY_FINGERPRINT`           | `SHA256:…` from `ssh-keygen -lf /etc/ssh/ssh_host_ecdsa_key.pub` (the action prefers ECDSA; the ED25519 one fails with "host key fingerprint mismatch") |

Repository variables (baked into the client bundle at build time, replacing the
values `scripts/build.bat` reads from `.env.local`):
`NEXT_PUBLIC_AI_ROLE_NAME`,
`NEXT_PUBLIC_DEV_ROLE_NAME`, `NEXT_PUBLIC_EUR_USD_RATE`. Unset ones build empty,
as they do locally.

The SSH user is `deploy` unless the `DEPLOY_USER` repository variable names
another. It must be in the `docker` group, be able to write the server
directory, and have `curl`.

## Server setup (once)

The server's `docker-compose.yaml` must be `deploy/docker-compose.yaml`. A copy
with a `build:` section or a fixed `image:` tag ignores `APP_IMAGE`, so every
deploy would fail its `APP_VERSION` check and roll back. `.env.local` sits
beside it and holds the runtime secrets (`AUTH0_*`, `MONGODB_URI`, `MK_*`, …).

## Dependency updates

`.github/dependabot.yml` opens at most one grouped pull request per ecosystem a
month (npm minor + patch, GitHub Actions); each goes through `check` like any
other pull request. Major npm versions are left to a deliberate upgrade.

## Production on t4a (since 2026-11-06)

Production moved from t2 to t4a (Hetzner, `77.42.42.60`; time-4-action/t4a-infra, `servers/t4a`), together with
the other apps on the shared `t4a` MongoDB database (t4a-partner-portal-api, t4a-admin, t4a-chat-ui, t4a-mcp).
Where this document says `/data/stack/apps/time-4-action/admin` or nginx, that was t2.

- `/srv/admin` (owned by `deploy`) holds `docker-compose.yaml` (= `deploy/docker-compose.t4a.yaml` in this repo: Traefik labels,
  loopback port 3005 for the deploy's health check) and `.env.local`. Traefik (`/srv/edge`) routes `admin.time-4-action.com` and `b2b.time-4-action.com` (the B2B customer portal)
  here, behind Cloudflare.
- MongoDB is t4a's shared one (`/srv/mongo`): `MONGODB_URI` is `mongodb://t4a-admin:...@mongo:27017/t4a?authSource=t4a`
  (this app's own user, `readWrite` on `t4a`). The container joins the external `mongo` network.
- The deploy workflow now runs `cd` on `vars.DEPLOY_DIR` (the default stays t2's directory).
- The `production` environment overrides the organization's deploy secrets: `PROD_DEPLOY_HOST` (`77.42.42.60`),
  `PROD_DEPLOY_SSH_KEY` (the key `github-actions@t4a-admin-t4a`, public half in `/home/deploy/.ssh/authorized_keys`
  on t4a), `PROD_DEPLOY_FINGERPRINT` (t4a's **ECDSA** host key, `SHA256:2wkXWs0QETKFiXKXbxbJRASeNd9I6zigPKVQGBtwfTk`;
  the Ed25519 one fails with "host key fingerprint mismatch") and the variable `DEPLOY_DIR=/srv/admin`.
- The move: the four apps stopped on t2 at 14:38 UTC, `mongodump` of `t4a` restored on t4a (all 34 collections'
  counts equal, 31,838 documents), the same images started on t4a, then the DNS records (proxied CNAMEs to
  `production.time-4-action.com`, overriding the `*` wildcard that still points at t2). About 4 minutes down.
  The t2 containers are stopped, not removed. To go back: delete the DNS record(s), the four settings above,
  copy the `t4a` database back, then `docker compose start` on t2 (for all four apps together).
