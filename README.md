# Smart Outage Management Portal (Scaffold)

This repository is a monorepo scaffold containing:

- `backend/`: Node.js + Express API (PostgreSQL, JWT auth, RBAC middleware, error handling)
- `frontend/`: React (Vite) app (routing by role, auth context, protected routes, base layouts)
- `shared/`: Shared TypeScript types/utilities
- `db/`: SQL migrations and seed data

## Prerequisites

- Node.js (LTS)
- PostgreSQL database available (local or remote)

## Environment variables

Copy `.env.example` to `.env` and set values as needed.

Required for backend:
- `DATABASE_URL`
- `JWT_SECRET`
- `BACKEND_PORT`
- `CORS_ORIGIN`

Required for frontend:
- `VITE_API_BASE_URL`

## Install

From repo root:

```bash
npm install
```

## Run (dev)

```bash
npm run dev:backend
npm run dev:frontend
```

Backend: `http://localhost:4000`  
Frontend: `http://localhost:5173`

## Database migrations & seed

SQL files are provided in `db/migrations` and `db/seed`.

Example (manual) using psql:

```bash
psql "$DATABASE_URL" -f db/migrations/001_init.sql
psql "$DATABASE_URL" -f db/seed/001_seed.sql
```

Seeded test users:
- operator@test.com / password
- crew@test.com / password
- customer@test.com / password

> Note: Password handling is scaffold-only (plain text in seed). Replace with hashed passwords before production.
"Repository Initialized

This repository was automatically initialized by Kavia AI system.
Branch: kavia-main-2599
Original requested branch: main"
