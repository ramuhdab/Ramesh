# SPQR Inventory Management — Playwright E2E Suite

End-to-end tests against the real backend API and the real frontend, not mocks. Two projects:

- **api** — exercises the REST API directly (Playwright's `request` fixture), covering the business rules and fixes documented in `docs/modules/01-foundation-modules.md` and `docs/modules/02-transactional-modules.md`.
- **ui** — drives the React frontend in a real browser for the pages that exist so far (login, forced password change, dashboard, users, organizations).

A third, internal **setup** project (`tests/api/global.setup.ts`) runs first: it onboards one organization, provisions a user for every system role (HR, Store Keeper, Tech Manager, Senior Manager, Finance, Managing Director), and creates the master data (building, department, position, categories, item policy) that every other test file needs. It writes the result to `.e2e-state.json`, which every other spec file reads — see `tests/api/state.ts` for why (Playwright collects/parses all spec files up front, so this hand-off has to be a written file, not an in-memory variable).

## Prerequisites

1. The backend and frontend must actually be running - see the root `README.md` ("Quick start"), or `docker compose up --build` from the repo root.
2. The backend's database must be migrated and seeded (`npm run prisma:migrate && npm run prisma:seed` in `backend/`) so a Super Admin login exists.
3. **The backend must NOT be running with `NODE_ENV=production`.** Organization activation tokens and temporary passwords are normally emailed and never persisted in plaintext; outside production the API echoes them back in the response specifically so this suite (and local development) can complete those flows without a real mailbox. This is dead code in production (see `organization.routes.ts` / `user.routes.ts` - both check `env.nodeEnv === "production"` and omit the fields).

## Install & run

```bash
cd e2e
npm install
npx playwright install --with-deps chromium
npm test                 # runs setup -> api -> ui, in that order
npm run test:api         # API suite only (still runs setup first, since api depends on it)
npm run report           # opens the HTML report from the last run
```

Environment variables (all optional, matching the defaults in `backend/prisma/seed.ts` and `backend/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `API_BASE_URL` | `http://localhost:4000/api/v1` | Where the backend is running |
| `WEB_BASE_URL` | `http://localhost:5173` | Where the frontend dev server is running |
| `SEED_SUPER_ADMIN_USERNAME` | `superadmin` | Must match what you seeded |
| `SEED_SUPER_ADMIN_PASSWORD` | `ChangeMe!2026` | Must match what you seeded |

## What's covered

- **WF1** Organization onboarding, activation, and the "pending org can't log in" / "duplicate org name" business rules
- **WF2/WF31/WF32** User creation, forced password change, password policy, account lockout after 5 failed attempts, RBAC (wrong role / Super-Admin-only routes rejected)
- **Multi-tenancy**: a second organization cannot see the first organization's master data
- **WF3/WF6** Employee creation (+ duplicate code rejection), rehire
- **WF8/WF9** Goods receipt, issuance, and the category-wide annual-allocation cap (the bug the second code review caught and this suite specifically regression-tests)
- **WF12/WF26** Lost-item reporting, the manager-verification gate, recovery calculation
- **WF5** Employee exit blocked until recovery is Finance-verified, then succeeds
- **WF15/WF16** Vendor approval state machine, performance rating + rolling score, rating-input validation
- **WF7** The full 4-level procurement approval chain with real per-role logins (Tech Manager → Senior Manager → Finance → Managing Director), wrong-role rejection, and automatic PO issuance on final approval
- **WF20** Procurement cancellation (mandatory reason, only while pending)
- **WF17** Indent creation
- Frontend: login error handling, successful login, role-based nav visibility, users list, logout + protected-route redirect, Super Admin organization onboarding through the actual UI

## What's NOT covered (yet)

- **WF21 escalation** is time-based (SLA hours) and not practically exercisable by a suite that needs to run in seconds - it was verified by code review instead (see `docs/modules/02-transactional-modules.md` item 3), not by this suite. If you want automated coverage, the escalation-hours config (`approval_workflows` master data) can be set to a fraction of an hour for a dedicated slow test.
- Reporting/Dashboard, Data Import/Export, and Attachments now exist (see `docs/modules/03-platform-modules.md`) but were built after this suite - they have no Playwright coverage yet. Platform Ops/backup remains infrastructure-only (documented in the deployment guides), so there's genuinely nothing to test there.
- Employee transfer, damaged-item return path, inventory replace/adjust, and indent approval are implemented but not yet covered by a dedicated test - the same patterns used in `01-employee-inventory-recovery.spec.ts` and `03-procurement-approval-chain.spec.ts` extend directly to them if you want to add coverage.

## A note on why this couldn't be run for you already

This test suite was written and reviewed in a sandbox with no access to any npm registry, so `npm install`, `npx playwright install`, and an actual test run could not be executed there. Please run the commands above yourself and report back what fails - given the amount of new code involved (fixing 2 blocking + 5 moderate bugs from the last review pass), a real run is very likely to surface something small that a static read-through missed, and it'll get fixed immediately.
