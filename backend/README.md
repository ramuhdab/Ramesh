# SPQR Inventory Management

Multi-tenant inventory, procurement, and employee-lifecycle management application. See `docs/` for the full Business Requirements Document, architecture, data model, module breakdown, and API specification, and `deployment/` for AWS/Azure deployment guides.

## What's built so far (v0.3)

- **Organization & Tenancy** (WF1): onboarding, activation, default role/permission seeding
- **Identity, Auth & RBAC** (WF2, 29, 31-33): login, JWT sessions, password policy/lockout/reset, server-side permission enforcement
- **Configuration & Master Data** (WF35): buildings, departments, positions, employee/inventory categories, item policies, notification settings, approval workflows, stock thresholds
- **Employee Lifecycle** (WF3-6): create/transfer/exit (two-phase, gated on recovery settlement)/rehire
- **Vendor Management** (WF15-16): onboarding → Finance verification → management approval, rolling performance score
- **Inventory Core** (WF7-11, 14): catalog, goods receipt, issuance (policy-checked), returns, replacement, physical-count adjustment
- **Loss/Damage & Recovery** (WF12-13, 26): incident reporting/verification, the shared recovery-calculation engine, Finance sign-off
- **Procurement & Approvals** (WF17-21): generic configurable approval-chain engine, indents, automatic PO generation, cancellation, SLA-based escalation (cron)
- **Attachments** (WF30): generic upload/download/delete linked to any entity, pluggable storage + virus-scan adapters
- **Data Import/Export** (WF34): bulk xlsx/csv import with per-row validation for 8 master-data/entity modules, matching export to xlsx/csv/pdf
- **Reporting & Dashboard** (WF24-25): KPI dashboard for every role, 5 predefined cross-module reports with preview + PDF/Excel/CSV export
- **Notifications** (WF22) and **Audit** (WF23): cross-cutting, event-bus driven
- A frontend covering: login, forced password change, KPI dashboard, users list/create, organization onboarding (Super Admin)
- An end-to-end Playwright test suite (`e2e/`) covering the API and UI flows built through batch 2 - see `e2e/README.md`

Not yet built: Platform Ops (WF27-28, automated backup/restore) - documented at the infrastructure/cron level in `deployment/06-Deployment-AWS.md` and `deployment/07-Deployment-Azure.md` instead of as application code, per `docs/04-Module-Breakdown.md`. With that one exception, all 35 source workflows now have either application code or an explicit documented treatment. See `docs/modules/` for the three build-log documents (foundation, transactional, platform) covering exactly what shipped in each batch, including three rounds of independent code review and every bug each one caught.

## Prerequisites

- Node.js 20+
- Docker + Docker Compose (for local Postgres, or the full containerized stack)

## Quick start (local development)

```bash
# 1. Start Postgres only (fastest path for active development)
docker compose up -d db

# 2. Backend
cd backend
cp .env.example .env         # edit if you changed the docker-compose DB password
npm install
npm run prisma:migrate       # creates tables
npm run prisma:seed          # creates the permission catalog + a Super Admin login
npm run dev                  # http://localhost:4000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev                  # http://localhost:5173
```

The seed script prints a temporary Super Admin username/password to the console (or set `SEED_SUPER_ADMIN_USERNAME` / `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` env vars before seeding to control them). Log in as the Super Admin, create your first organization from the "Organizations" page, then use the activation token printed in the backend console (the `MAIL_PROVIDER=console` adapter logs emails instead of sending them) to activate it and log in as that organization's admin.

## Full containerized stack

```bash
docker compose up --build
```
Runs Postgres + backend + frontend (nginx-served static build, proxying `/api` to the backend container). Run migrations/seed once against the containerized DB the same way as above, pointing `DATABASE_URL` at `localhost:5432` from your host machine, or `docker compose exec backend npm run prisma:migrate`.

## Tests

```bash
cd backend
npm test
```

**Note on this environment:** these files were authored and reviewed in a sandbox without access to the npm package registry, so `npm install` / `npm test` could not be executed here to confirm a clean install. The code has been carefully reviewed for consistency with the Prisma schema and API spec, but please run `npm install && npm test` yourself as the first step before relying on it — flag anything that doesn't come up clean and it'll get fixed immediately.

## Project layout

```
backend/            Node.js/Express/TypeScript modular monolith (see docs/02-Architecture.md)
  prisma/schema.prisma   Single source of truth for the data model
  src/modules/*          One folder per module (organizations, auth, users, roles, config, notifications, audit, ...)
frontend/            React/Vite/TypeScript SPA
docs/                BRD, architecture, data model, module breakdown, API spec
deployment/          AWS and Azure deployment guides
skills/              Project development-standards skill for consistent future sessions
```
