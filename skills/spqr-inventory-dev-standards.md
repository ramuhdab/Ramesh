---
name: spqr-inventory-dev-standards
description: "Use this skill whenever building, extending, or reviewing any part of the SPQR Inventory Management application (backend modules, frontend screens, database schema, API routes, or deployment config). Triggers include: any mention of 'SPQR Inventory Management', its modules (Organization, Identity/RBAC, Employee, Inventory, Procurement, Vendor, Recovery, Notifications, Audit, Reporting, Import/Export, Configuration, Attachments, Platform Ops), or continuing work on this specific codebase across sessions. Ensures every new piece of work stays consistent with the product's BRD, architecture, data model, and API conventions instead of re-deriving or drifting from them."
license: Internal use — Sparquer / SPQR Inventory Management project only
---

# SPQR Inventory Management — Development Standards

This skill exists so that work on SPQR Inventory Management stays consistent across sessions and contributors, since the product is being built module-by-module over many sessions rather than in one pass. Read the project's own docs first — this skill tells you *how* to work, the docs tell you *what* to build.

## Source of truth documents (read in this order before building anything)
1. `docs/01-Business-Requirements-Document.md` — the 35 workflows and their business rules; never invent a rule not traceable to this doc without flagging it as an assumption.
2. `docs/02-Architecture.md` — modular monolith, Node.js/Express/TypeScript + React + PostgreSQL/Prisma, multi-tenant "shared schema + organization_id + RLS" model. Do not introduce a new database technology, a message queue, or a microservice without updating this doc first and explaining why the low-cost/simplicity principle no longer holds.
3. `docs/03-Data-Model.md` — entity/column names and relationships. Extend it, don't fork it: if a module needs a new table, add it here before writing migrations.
4. `docs/04-Module-Breakdown.md` — the 14-module boundary map and build order. New code belongs to exactly one module folder; cross-module access goes through that module's public service interface, never through another module's Prisma models directly.
5. `docs/05-API-Specification.md` — route names, permission strings, and response envelope (`{ data, meta }` / `{ error }`). Keep new endpoints consistent with this shape and add them here when built.

## Non-negotiable conventions
- **RBAC is enforced server-side on every route** via a permission-check middleware (`module:action` string), never only in the frontend.
- **Every mutating request writes an audit entry** (old value, new value, user, org, IP, user agent) — this is cross-cutting middleware, not something each module re-implements.
- **Multi-tenancy:** every tenant-scoped query is implicitly filtered by `organization_id`; never write a raw query that skips this filter. Row-level security is the backstop, not the primary mechanism — application code must still filter explicitly.
- **Soft deletes only** for anything master data can reference (`is_active = false`); referenced records are never hard-deleted, per BRD Section 5.7 / FR-35.
- **Domain events, not direct calls, for side effects.** A module that needs to trigger a notification or an audit entry publishes an event on the internal event bus; it does not import the Notifications or Audit module's internals directly.
- **Shared types/validation** between frontend and backend (zod schemas / generated types) — don't hand-roll duplicate validation on each side.
- **No new infrastructure dependency** (cache, queue, search engine, second database) without first checking whether the existing Postgres-only stack can satisfy the requirement — the product's cost/simplicity requirement (BRD Section 7) is a hard constraint, not a suggestion.

## Per-module build checklist
When building or extending a module, produce, in this order:
1. A short module doc (`docs/modules/<NN>-<module-name>.md`) stating: workflows covered, entities touched, endpoints added, and any deviations from the specs above (with reasoning).
2. Prisma schema changes + migration.
3. Service layer (business logic, the only place business rules from the BRD are enforced) → repository/data-access layer → controller/route layer, in that order.
4. Route entries added to `docs/05-API-Specification.md`.
5. Basic tests (unit tests for service-layer business rules at minimum — e.g., "cannot issue beyond annual allocation," "cannot exit employee before recovery is finance-verified").
6. A short changelog note of what shipped, surfaced back to the user before moving to the next module (this project's owner has asked to be kept in the loop step by step — don't silently batch multiple modules without a check-in).

## When something in the spec is ambiguous or missing
Flag it explicitly (as this project's BRD does in its "Open Questions / Risks" section) rather than guessing silently. Add new ambiguities to that section rather than making an undocumented assumption buried in code.

## Deployment awareness
Any change to environment variables, external services (email, storage), or infrastructure requirements must be reflected in **both** `deployment/06-Deployment-AWS.md` and `deployment/07-Deployment-Azure.md` — the product must stay deployable to either cloud without code changes, per BRD Section 3.4/6.
