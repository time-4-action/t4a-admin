# Auth0 Roles & Authentication

How authentication and role-based access control works across the admin dashboard and the AI chat application.

## Architecture Overview

```
┌─────────────┐     ┌──────────┐     ┌───────────┐
│  Admin App  │────>│  Auth0   │<────│  Chat App │
│  (this)     │     │  Tenant  │     │           │
└──────┬──────┘     └──────────┘     └─────┬─────┘
       │                                    │
       └──────────┐    ┌───────────────────┘
                  ▼    ▼
              ┌──────────┐
              │ MongoDB  │
              │ (shared) │
              └──────────┘
```

Both apps share the same Auth0 tenant and MongoDB instance. The admin app manages users and limits; the chat app enforces them.

## Authentication Layers

| Layer | Location | What is checked |
|-------|----------|----------------|
| Middleware | `middleware.ts` / `lib/proxy.ts` | User has `admin` role in ID token |
| API routes | `app/api/*/route.ts` | Valid session exists |
| Data isolation | MongoDB queries | `userId === session.user.sub` |
| Tool permissions | MCP server (chat app) | Access token roles/permissions claims |

## How Roles Get Into Tokens

Roles are injected into tokens via an Auth0 **Post-Login Action**:

```js
exports.onExecutePostLogin = async (event, api) => {
  const roles = event.authorization?.roles ?? [];
  api.idToken.setCustomClaim("https://time-4-action.com/roles", roles);
  api.accessToken.setCustomClaim("https://time-4-action.com/roles", roles);
};
```

The namespace (`https://time-4-action.com/roles`) is required by Auth0 for custom claims.

## Middleware Flow

```
Request
  │
  ├── /auth/*           → pass through (Auth0 handles login/callback/logout)
  ├── /unauthorized     → pass through
  ├── /forbidden        → pass through
  │
  ├── No session        → redirect to /auth/login
  │
  └── Session exists
        │
        ├── Decode ID token JWT payload (base64, no network call)
        ├── Read roles from "https://time-4-action.com/roles"
        │
        ├── Has "admin"  → allow request
        └── No "admin"   → redirect to /forbidden
```

### Why the ID Token?

Roles live in the **ID token**, not the access token. The middleware decodes it locally:

```ts
const idToken = session.tokenSet?.idToken;
const payload = JSON.parse(
  Buffer.from(idToken.split(".")[1], "base64url").toString()
);
const roles = payload["https://time-4-action.com/roles"] ?? [];
```

## Auth0 Automatic Routes

| URL | Purpose |
|-----|---------|
| `/auth/login` | Redirect to Auth0 Universal Login |
| `/auth/callback` | Auth0 redirects back here; session created |
| `/auth/logout` | Clear session, redirect to Auth0 logout |

## Role Definitions

| Role | Purpose | Visible in Admin UI |
|------|---------|:---:|
| `admin` | Access to this admin dashboard | No (system role) |
| `AI User` | Grants access to the AI chat product | Yes |
| `dev` | Internal development role | No (filtered out) |

The `AI User` and `dev` role names are configurable via environment variables (`NEXT_PUBLIC_AI_ROLE_NAME`, `NEXT_PUBLIC_DEV_ROLE_NAME`).

## Chat App Integration

When the chat app calls the MCP server, it forwards the user's **access token**:

```ts
const { token: accessToken } = await auth0.getAccessToken();
mcpClient = await createMCPClient({
  transport: {
    type: "sse",
    url: process.env.MCP_SERVER_URL,
    headers: { Authorization: `Bearer ${accessToken}` },
  },
});
```

The MCP server validates the token and reads role/permission claims to determine which tools the user can call.
