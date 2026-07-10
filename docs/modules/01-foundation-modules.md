# Module Build Log: 01 — Foundation (Organization, Identity/RBAC, Configuration)

**Status:** Shipped (v0.1) | **Date:** 2026-07-09

## Workflows covered
WF1 (Organization Onboarding), WF2 (User Registration), WF22 (Notifications), WF23 (Audit), WF29 (Role Management), WF31 (RBAC), WF32 (Authentication & Password Reset), WF33 (Session Timeout — token expiry enforced; idle-timer UI not yet built), WF35 (System Configuration & Master Data).

## What was built
- **Backend:** Node/Express/TypeScript modular monolith, Prisma schema covering the full data model (all 14 modules' tables, so future modules only add code, not schema churn), JWT auth with refresh tokens, bcrypt password hashing, RBAC middleware enforced server-side on every route, a domain event bus with Audit and Notifications subscribed as cross-cutting listeners, and full CRUD for the 9 master-data entity types via one generic factory.
- **Frontend:** React/Vite/TS SPA — login, forced password change, protected routing, a Users page (create/list/assign role), an Organizations page (Super Admin onboarding).
- **Ops:** Dockerfiles for both services, docker-compose for local Postgres + full stack, a seed script (permission catalog + bootstrap Super Admin), `.env.example`, README with setup steps.
- **Tests:** `tests/password.test.ts` (password policy, hashing, reuse detection — FR-5) and `tests/rbac.test.ts` (permission middleware allow/deny paths, Super Admin bypass, Super-Admin-only route guard — FR-3).

## Entities touched
Organization, User, SuperAdmin, Role, Permission, RolePermission, UserRole, PasswordHistory, Session, Building, Department, Position, EmployeeCategory, InventoryCategory, ItemPolicy, NotificationSetting, ApprovalWorkflow, StockThreshold, Notification, AuditLog.

## Endpoints added
See `docs/05-API-Specification.md` Sections 1–4, 10, 11 (Auth, Organizations, Users/Roles/Permissions, Configuration & Master Data, Notifications, Audit — audit query endpoint itself is stubbed for a later pass; writes are live).

## Deviations from the original spec (flagged, not silently assumed)
1. **Username/email uniqueness scope:** the source spec says "Username unique. Email unique." without stating a scope. Built as **globally unique across the platform** (not just per-organization) because login has no other way to resolve which organization a username belongs to without adding a second identifier to the login form. If organizations need to reuse the same username across tenants, this needs a login-time organization selector added — flagged for your decision.
2. **Subscription plan (WF1):** stored as a free-text field on Organization, defaulted to `"standard"`. No billing/plan-enforcement logic exists yet (matches the BRD's open question #3).
3. **Session idle-timeout UI (WF33):** the backend rejects expired JWTs (enforced), and the 30-min/5-min-warning *client-side* countdown/re-auth-prompt UI has not been built yet — flagged for the next frontend pass.
4. **Audit log query API:** writes are fully wired (every domain event + explicit service calls land in `audit_logs`), but the `GET /audit-logs` read/filter endpoint (WF23, API spec Section 11) is not yet built — planned alongside Reporting.

## Known limitation: could not run the code in this environment
This sandbox has no access to any npm package registry or CDN (registry.npmjs.org, npmmirror, unpkg, jsdelivr, even github.com — all unreachable, confirmed via curl), so `npm install`, `tsc --noEmit`, and `npm test` could not be executed here to get a real green build. **Please run `npm install && npm test` in both `backend/` and `frontend/` as your first step** and report back anything that doesn't come up clean.

## Independent verification pass (LLM-as-judge)
Since execution wasn't possible, a second, independent agent (fresh context, no involvement in writing the code) was asked to review the entire codebase as a skeptical reviewer: schema-vs-code consistency, the full import/export graph, route wiring against the API spec, RBAC/multi-tenancy scoping, auth logic correctness, frontend session handling, and Docker/nginx config. It returned a 7/10 confidence verdict with no blocking bugs but five moderate issues, all of which have now been fixed:

1. **Cross-tenant notification read** — `POST /notifications/:id/read` accepted any notification id with no ownership check, so a user could mark another organization's notification as read. Fixed: `markNotificationRead` now requires a matching `organizationId` + `userId` and 404s otherwise.
2. **No organization-status enforcement at login** — a "pending" (not yet activated) or "suspended" organization's users could still log in and use the API. Fixed: `auth.service.ts` now checks `organization.status === "active"` on both login and token refresh.
3. **Collapsed create/update/delete permissions** — the master-data CRUD factory used one shared "write" permission for POST/PATCH/DELETE even though `CONFIG_MASTER_CREATE/UPDATE/DELETE` (and equivalents) were defined as distinct permissions. Fixed: the factory and `config.routes.ts` now take separate `createPermission`/`updatePermission`/`deletePermission`, and `CONFIG_NOTIF_DELETE`/`CONFIG_APPROVAL_DELETE` were added to complete the set.
4. **Duplicate welcome/activation emails** — `organization.created` and `user.created` triggered both a direct, detailed email (with the temp password/activation token) from the originating service AND a second, generic one from the Notifications event-bus listener. Fixed: the listener now skips its own email for events already handled directly, while still recording the bell notification.
5. **Frontend session desync after refresh-token expiry** — when the refresh token expired, the API client cleared its tokens but `AuthContext`'s `user` state (and therefore `isAuthenticated`) stayed stale, so `ProtectedRoute` wouldn't redirect to `/login` - the app just silently failed every request. Fixed: added an `onSessionExpired` hook the API client calls whenever a request can't recover from a 401, which `AuthContext` uses to clear its own state.

None of this required schema changes; all fixes were contained to the affected service/route/component files.

## Next up (per docs/04-Module-Breakdown.md build order)
Employee Lifecycle → Vendor Management → Inventory Core → Procurement & Approvals → Loss/Damage & Recovery, then Reporting/Dashboard, Import/Export, Attachments, and Platform Ops.
