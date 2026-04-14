# Setup Guide

Complete guide for setting up the admin dashboard from scratch.

## Prerequisites

- **Node.js** 20+
- **npm** 10+
- **Docker** (for production deployment)
- An **Auth0** tenant with Management API access
- A **MongoDB** instance (shared with the main chat application)

## 1. Install Dependencies

```bash
npm install
```

## 2. Auth0 Configuration

### Create the Web Application

1. Go to **Auth0 Dashboard > Applications > Create Application**
2. Name: `admin-web`, Type: **Regular Web App**
3. Configure URLs:
   - Allowed Callback URLs: `http://localhost:3000/auth/callback`
   - Allowed Logout URLs: `http://localhost:3000`
   - Allowed Web Origins: `http://localhost:3000`

### Create the Machine-to-Machine App

1. **Applications > Create Application** > Name: `admin-web-mgmt`, Type: **Machine to Machine**
2. Authorize for **Auth0 Management API** with these scopes:
   - `read:users`, `update:users`, `create:users`, `delete:users`
   - `read:roles`, `create:role_members`, `delete:role_members`
3. Save `client_id` and `client_secret` for `AUTH0_MGMT_CLIENT_ID` / `AUTH0_MGMT_CLIENT_SECRET`

### Create Roles

In **Auth0 Dashboard > User Management > Roles**, create:

| Role | Purpose |
|------|---------|
| `admin` | Full access to this admin dashboard |
| `AI User` | Grants access to the AI chat product |
| `dev` | Internal development role (hidden from admin UI) |

### Add the Login Action

Create an **Action** that runs post-login to inject roles into tokens:

```js
exports.onExecutePostLogin = async (event, api) => {
  const roles = event.authorization?.roles ?? [];
  api.idToken.setCustomClaim("https://time-4-action.com/roles", roles);
  api.accessToken.setCustomClaim("https://time-4-action.com/roles", roles);
};
```

## 3. Environment Variables

Create `.env.local` in the project root:

```env
# Auth0 - Web Application
AUTH0_SECRET=<random 32-byte secret>
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://<your-tenant>.auth0.com
AUTH0_CLIENT_ID=<admin-web client_id>
AUTH0_CLIENT_SECRET=<admin-web client_secret>

# Auth0 - Management API (Machine-to-Machine)
AUTH0_MGMT_CLIENT_ID=<admin-web-mgmt client_id>
AUTH0_MGMT_CLIENT_SECRET=<admin-web-mgmt client_secret>
AUTH0_DB_CONNECTION=Username-Password-Authentication

# MongoDB (same instance as the chat app)
MONGODB_URI=mongodb+srv://...

# Optional
NEXT_PUBLIC_APP_NAME=Admin
NEXT_PUBLIC_AI_ROLE_NAME=AI User
NEXT_PUBLIC_DEV_ROLE_NAME=dev
NEXT_PUBLIC_EUR_USD_RATE=0.92
```

## 4. Run in Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to Auth0 login. Only users with the `admin` role can access the dashboard.

## 5. Production Deployment

### Docker Build & Run

```bash
docker compose up --build
```

This builds a standalone Next.js container and exposes it on port **3005**.

### Manual Docker Build

```bash
docker build \
  --build-arg NEXT_PUBLIC_APP_NAME="Admin" \
  --build-arg NEXT_PUBLIC_AI_ROLE_NAME="AI User" \
  --build-arg NEXT_PUBLIC_EUR_USD_RATE=0.92 \
  -t etiamsi/t4a-admin:latest .

docker push etiamsi/t4a-admin:latest
```

On Windows, use the included `build-and-push.cmd` script which reads build args from `.env.local` automatically.

## 6. Verification

1. **Login** — visit the app URL, verify Auth0 redirect and admin-only access
2. **User management** — list users, create a user, set a spending limit
3. **Role management** — assign/remove roles via the Access pages
4. **Spending limits** — set a `$0.00` limit on a test user, verify the chat app shows "Spending limit reached"
