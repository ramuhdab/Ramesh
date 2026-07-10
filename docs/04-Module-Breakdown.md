# Module Breakdown
## SPQR Inventory Management

**Version:** 1.0 | **Date:** 2026-07-09

All 35 source workflows map onto 13 backend modules inside the modular monolith (see 02-Architecture.md). Build order reflects dependency order (e.g., Identity/RBAC must exist before anything role-gated can be built).

| # | Module | Workflows Covered | Depends On |
|---|---|---|---|
| 1 | Organization & Tenancy | WF1 | — |
| 2 | Identity, Auth & RBAC | WF2, WF29, WF31, WF32, WF33 | Organization |
| 3 | Configuration & Master Data | WF35 | Organization, Identity |
| 4 | Employee Lifecycle | WF3, WF4, WF5, WF6 | Configuration, Identity |
| 5 | Vendor Management | WF15, WF16 | Configuration, Identity |
| 6 | Inventory Core | WF7, WF8, WF9, WF10, WF11, WF14 | Configuration, Employee |
| 7 | Loss/Damage & Recovery | WF12, WF13, WF26 | Inventory Core, Employee |
| 8 | Procurement & Approvals | WF17, WF18, WF19, WF20, WF21 | Vendor, Inventory Core |
| 9 | Notifications | WF22 | Identity |
| 10 | Audit | WF23 | Identity (cross-cutting; wraps all modules) |
| 11 | Reporting & Dashboard | WF24, WF25 | All data modules (read-only aggregation) |
| 12 | Data Import/Export | WF34 | Configuration, Employee, Inventory, Vendor |
| 13 | Attachments | WF30 | Identity |
| 14 | Platform Ops (Backup/Restore) | WF27, WF28 | Infrastructure-level, not tenant code |

## Module Responsibilities

**1. Organization & Tenancy** — create/activate organizations, seed default roles/permissions, enforce organization uniqueness and subscription flag.

**2. Identity, Auth & RBAC** — login, password reset/policy/lockout, JWT issuance/refresh, session timeout, role & permission CRUD, role/permission assignment, re-authentication gate for sensitive actions.

**3. Configuration & Master Data** — buildings, departments, positions, employee/inventory categories, item policies, notification settings, approval-workflow configuration, stock thresholds. This module is the single source of truth every other module reads from; nothing else defines its own copy of "departments" or "categories."

**4. Employee Lifecycle** — create/transfer/exit/rehire employees, employee history, eligibility flag for inventory issuance.

**5. Vendor Management** — vendor onboarding + document upload, Finance/management approval chain, post-purchase rating and rolling performance score.

**6. Inventory Core** — item catalog, purchase-triggered goods receipt/inspection, issuance against policy limits, returns and disposition, replacement requests, physical-count adjustments.

**7. Loss/Damage & Recovery** — loss/damage reporting and verification, and the shared recovery-calculation engine used by exit, loss, and damage flows alike (join/leave dates × item policy → amount → Finance sign-off → deduction reference).

**8. Procurement & Approvals** — the generic approval-workflow engine (configurable levels/roles/escalation) driving indents and procurement requests, low/critical stock alerting, cancellation, and SLA-based escalation.

**9. Notifications** — internal event bus consumer; renders and dispatches email/bell/SMS/push for every event raised by other modules.

**10. Audit** — cross-cutting middleware + query API over the immutable audit log; every module writes to it, nothing writes over it.

**11. Reporting & Dashboard** — read-only aggregation layer over the other modules' data; KPI queries for the dashboard, filterable reports exportable to PDF/Excel.

**12. Data Import/Export** — generic template-driven bulk import/export engine parameterized per target module (employees, inventory, vendors, buildings, departments, positions, categories), with validation and error reporting.

**13. Attachments** — upload, virus-scan, store, and link files to any entity (vendor documents, employee documents, damage-report photos, etc.); other modules reference attachments by ID rather than re-implementing upload handling.

**14. Platform Ops** — scheduled encrypted backups, retention, verification, and admin-triggered restore; operates at the infrastructure/cron level, documented fully in the deployment guides rather than exposed as a tenant-facing module.

## Build Sequencing for the Code Phase

Recommended order once we move from documentation to implementation (each step ships with its own short module doc + a working, testable slice):

1. Organization & Tenancy + Identity/RBAC (nothing else is testable without login and roles)
2. Configuration & Master Data (everything downstream reads this)
3. Employee Lifecycle
4. Vendor Management
5. Inventory Core
6. Procurement & Approvals (needs Vendor + Inventory)
7. Loss/Damage & Recovery (needs Employee + Inventory)
8. Notifications + Audit (wire into everything already built)
9. Reporting & Dashboard
10. Data Import/Export
11. Attachments
12. Platform Ops (backup/restore) + final hardening pass

---
*Next: 05-API-Specification.md*
