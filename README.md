# t4a-admin

Admin dashboard for managing users, access types, and AI usage costs. Built with Next.js 16, Auth0, and MongoDB.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Auth0](https://img.shields.io/badge/Auth0-EB5424?logo=auth0&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

---

## Overview

A centralized admin panel for the [time-4-action](https://time-4-action.com) platform. It connects to the same Auth0 tenant and MongoDB instance as the main AI chat application, providing a single pane of glass for:

- **User Management** &mdash; create, edit, delete users; send password resets
- **Access Control** &mdash; assign and revoke Auth0 roles with drag-and-drop or batch operations
- **Spending Limits** &mdash; set per-user daily/weekly/monthly/total cost caps
- **Usage Analytics** &mdash; track AI token usage, costs, and conversations with interactive charts
- **Permission Management** &mdash; configure fine-grained API permissions per access type

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment (see docs/setup-guide.md for all variables)
cp .env.example .env.local   # then fill in Auth0 + MongoDB credentials

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) &mdash; requires Auth0 login with the `admin` role.

## Production

```bash
# Docker
docker compose up --build     # builds and runs on port 3005

# Or build manually
npm run build
npm start
```

## Project Structure

```
├── app/
│   ├── api/admin/            # REST API (users, roles, stats, usage)
│   ├── dashboard/            # KPI cards + charts
│   ├── users/                # User list, detail, create
│   ├── roles/                # Access types, permissions, assignments
│   ├── usage/                # Cost & token reports
│   └── settings/             # App configuration
├── components/               # UI components (shadcn/ui + custom dialogs)
├── lib/                      # Auth, DB, utilities
├── models/                   # Mongoose schemas
└── docs/                     # Documentation
```

## Key Features

### User Management
Full CRUD for Auth0 users with integrated MongoDB usage data. User detail pages show per-model token breakdowns, spending limits, and conversation counts.

### Access Types (Roles)
Auth0 roles are surfaced as "access types" with a searchable permission editor. The assign page supports single-user drag-and-drop and multi-user batch operations with confirmation dialogs for sensitive roles.

### Spending Limits
Per-user cost caps with configurable periods (daily, weekly, monthly, total). Limits set here are enforced by the chat application in real time.

### Usage Analytics
Dashboard with KPI cards (total spend, active users, conversations today) and interactive bar/pie charts breaking down costs by user and model. All costs stored in USD with client-side EUR toggle.

### Dev User Filtering
Users with the `dev` role are hidden from all lists and their usage is aggregated under a single "Development" entry in cost reports.

## Documentation

| Document | Description |
|----------|-------------|
| [Setup Guide](docs/setup-guide.md) | Full installation and configuration walkthrough |
| [Architecture](docs/architecture.md) | Technical architecture, data model, and API reference |
| [Auth0 Roles](docs/auth0-roles.md) | Authentication flow and role-based access control |

## Environment Variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `AUTH0_SECRET` | Yes | Random 32-byte session secret |
| `AUTH0_ISSUER_BASE_URL` | Yes | Auth0 tenant URL |
| `AUTH0_CLIENT_ID` | Yes | Web app client ID |
| `AUTH0_CLIENT_SECRET` | Yes | Web app client secret |
| `AUTH0_MGMT_CLIENT_ID` | Yes | M2M app client ID |
| `AUTH0_MGMT_CLIENT_SECRET` | Yes | M2M app client secret |
| `AUTH0_DB_CONNECTION` | Yes | Auth0 database connection name |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `NEXT_PUBLIC_APP_NAME` | No | Browser tab title (default: "Admin") |
| `NEXT_PUBLIC_AI_ROLE_NAME` | No | AI access role name (default: "AI User") |
| `NEXT_PUBLIC_DEV_ROLE_NAME` | No | Dev role to hide (default: "dev") |
| `NEXT_PUBLIC_EUR_USD_RATE` | No | EUR/USD conversion rate (default: 0.92) |

## License

Private &mdash; All rights reserved.
