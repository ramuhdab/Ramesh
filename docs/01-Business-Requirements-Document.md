# Business Requirements Document (BRD)
## SPQR Inventory Management

**Product Owner:** Sparquer
**Prepared for:** Sparquer / SPQR Inventory Management Product Initiative
**Version:** 1.0
**Date:** 2026-07-09
**Status:** Draft for review

---

## 1. Purpose

SPQR Inventory Management is a multi-tenant, cloud-hosted SaaS application that lets organizations (e.g., facilities management companies) manage employee-issued inventory — uniforms, PPE, safety equipment, tools, and consumables — across their full lifecycle: procurement, receipt, issuance, return, replacement, loss/damage recovery, and retirement. It also manages the employees, vendors, buildings, and departments that inventory moves between, with role-based access control, multi-level procurement approvals, notifications, audit logging, and reporting.

This document defines the business requirements the product must satisfy. It is derived directly from the 35 workflow specifications supplied by the business (source: *Complete Workflow Specifications.docx*) and is the baseline against which architecture, module design, and the application build will be validated.

## 2. Business Objectives

1. Give operations and HR teams a single system of record for who has been issued what inventory, when, and under what policy.
2. Enforce multi-level procurement and indent approval chains (Tech Manager → Senior Manager → Finance → Managing Director) with escalation on delay.
3. Automate financial recovery calculations when employees exit, lose, or damage issued items, tied to Finance sign-off.
4. Provide organization admins full self-service control of master data (departments, positions, categories, item policies) without vendor involvement.
5. Be sellable as a multi-tenant product: any number of client organizations can onboard, each with isolated data, its own admins, roles, and configuration.
6. Keep infrastructure and licensing cost minimal — this is a cost-sensitive product decision, not just an engineering nice-to-have (see Section 7 and the Architecture document).
7. Be deployable on either AWS or Azure with no code changes, only configuration/infra changes.

## 3. Scope

### 3.1 In Scope (v1 / MVP)
All 35 workflows below, grouped into product modules (full mapping in *04-Module-Breakdown.md*):

- Organization onboarding & multi-tenancy
- User, role & permission management (RBAC)
- Authentication, password reset, session timeout
- Employee lifecycle: creation, transfer, exit, rehire
- Inventory lifecycle: purchase, goods receipt, issue, return, replacement, loss, damage, adjustment
- Vendor management & performance scoring
- Procurement/indent workflow with multi-level approval and escalation
- Low-stock / critical-stock alerting
- Notifications (email, in-app bell, optional SMS/push)
- Audit logging of every transaction
- Reporting & dashboards
- Recovery calculation engine (exit/loss/damage → payroll deduction)
- Backup & restore
- Data import/export (Excel/CSV/PDF)
- System configuration & master data management
- File attachments with virus scanning

### 3.2 Out of Scope (v1)
- Payroll processing itself (the system calculates recovery amounts and hands off to Finance/payroll; it does not run payroll).
- Native mobile apps (v1 is a responsive web application only).
- Deep ERP/accounting system integrations (may be a v2 integration point via export/API).
- Multi-currency / multi-language (single currency, English-only for v1).

### 3.3 Assumptions
- "Organization" = tenant. One deployment serves many organizations, each logically isolated.
- Sparquer is the platform owner ("Super Administrator") sitting above all organizations; each organization has its own "Organization Administrator."
- The business explicitly asked for the lowest reasonable cost and simplest reasonable technology — this is treated as a hard requirement, not a preference, and drives every architecture decision (see Architecture doc, Section on cost).

### 3.4 Constraints
- Must run on AWS or Azure (customer/deployment choice), documented for both.
- Must be buildable and operable by a small team (not a large SRE org) — so operational simplicity is weighted heavily.

## 4. Stakeholders & Actors

| Actor | Description |
|---|---|
| Sparquer Super Administrator | Platform-level owner. Onboards organizations, has visibility across tenants, cannot be overridden by org admins. |
| Organization Administrator | Tenant-level admin. Manages users, roles, master data, and configuration for their own organization only. |
| HR | Manages employee lifecycle (create, transfer, exit, rehire). |
| Store Keeper | Handles goods receipt, inventory issue/return inspection. |
| Department User / Employee | Requests indents, receives/returns inventory, requests replacements, reports loss/damage. |
| Tech Manager, Senior Manager, Managing Director | Sequential procurement/indent approval chain. |
| Finance | Verifies vendor payments, recovery calculations, and procurement funding. |
| System Administrator | Operates backups/restores, unlocks accounts, manages platform-level configuration. |
| Vendor | External supplier of inventory items; not a system user in v1 (managed as a master-data record), performance-rated by the system. |

## 5. Functional Requirements

The functional requirements below are grouped by module. Each corresponds 1:1 to a workflow in the source specification (workflow number in parentheses).

### 5.1 Organization & Tenant Management
- **FR-1 Organization Onboarding (WF1):** Super Admin creates an organization with details and a subscription plan, creates the initial Organization Admin, sends an activation email; organization stays inactive until activated. Organization name must be unique platform-wide. Default roles/permissions are created automatically for every new organization.

### 5.2 Identity, Authentication & Access Control
- **FR-2 User Registration (WF2):** Org Admin creates users, assigns roles, system issues a temporary password (expires in 24h) by email; user must reset password on first login. Username and email must be unique within the platform.
- **FR-3 Role & Permission Assignment / RBAC (WF31):** Roles are created per organization with permissions configurable at module, screen, and action level (Create/View/Update/Delete/Approve/Export). Users must have ≥1 role, may have multiple. Org Admins cannot modify Super Admin permissions. Every permission change is audited and takes effect on next login. Role names unique per org; system-defined roles cannot be deleted.
- **FR-4 Role Management (WF29):** Super Admin (platform-level roles) creates roles, assigns permissions and users, all changes audited.
- **FR-5 Authentication & Password Reset (WF32):** Standard username/password auth; account locks after 5 failed attempts; passwords encrypted; reset links expire in 30 minutes; last 5 passwords cannot be reused; password policy enforced (8+ chars, upper, lower, number, special character).
- **FR-6 Session Timeout & Re-Authentication (WF33):** 30-minute inactivity timeout with a 5-minute warning; re-authentication required before sensitive actions (user admin, role management, procurement approval, org configuration); expired sessions rejected on the API.

### 5.3 Employee Lifecycle
- **FR-7 Employee Creation (WF3):** HR creates an employee with a unique Employee ID, mandatory joining date, building, and position; employee becomes eligible for inventory issuance once active.
- **FR-8 Employee Transfer (WF4):** HR changes building/department, subject to manager approval; inventory assignments persist; history is recorded.
- **FR-9 Employee Exit (WF5):** Marking an employee as leaving triggers an inventory check and recovery calculation; exit cannot complete until inventory is returned, recovery is calculated, and Finance has approved any salary deduction.
- **FR-10 Employee Rehire (WF6):** HR can reactivate a previous employee; historical inventory records are retained; the employee becomes newly eligible for issuance.

### 5.4 Inventory Lifecycle
- **FR-11 Inventory Purchase (WF7):** Low stock triggers a procurement request that flows Tech Manager → Senior Manager → Finance → Managing Director → Purchase Order → Vendor → Goods Received → Inventory Updated.
- **FR-12 Goods Receipt (WF8):** Store Keeper inspects quantity and quality on delivery; acceptance updates inventory, rejection triggers a vendor return.
- **FR-13 Inventory Issue (WF9):** Store Keeper issues items to an eligible employee after validating against the item's annual allocation policy; issuance is signed for by the employee.
- **FR-14 Inventory Return (WF10):** Store Keeper inspects returned items; good-condition items go back to stock, damaged items are scrapped and enter recovery.
- **FR-15 Inventory Replacement (WF11):** Employee-requested replacement requires manager approval and reason verification before reissue; inventory history updated.
- **FR-16 Lost Item (WF12):** Reported loss requires manager verification, recovery calculation, Finance approval, and replacement approval before a new item is issued.
- **FR-17 Damaged Item (WF13):** Inspected damage is either repaired (returns to stock) or disposed of (triggers recovery).
- **FR-18 Inventory Adjustment (WF14):** Physical count discrepancies require manager approval before the inventory record is adjusted; every adjustment is audit-logged.
- **FR-19 Low Stock Alert (WF18):** Stock below 20 units raises a yellow alert, suggests procurement, notifies the admin, and can generate an indent.
- **FR-20 Critical Stock Alert (WF19):** Stock below 5 units raises a red alert and triggers escalated, high-priority procurement. (Thresholds are configurable master data, not hardcoded — see FR-35.)

### 5.5 Vendor & Procurement
- **FR-21 Vendor Approval (WF15):** Org Admin creates a vendor and uploads documents; Finance verifies, management approves, vendor becomes usable in procurement.
- **FR-22 Vendor Performance (WF16):** After each completed purchase, delivery, quality, and price are rated; a rolling vendor score is maintained.
- **FR-23 Indent Workflow (WF17):** Department users raise indents that flow through the same Tech Manager → Senior Manager → Finance → MD chain before becoming a procurement action.
- **FR-24 Procurement Cancellation (WF20):** A pending procurement can be cancelled by an admin with a mandatory reason; the workflow closes and is audit-recorded.
- **FR-25 Approval Escalation (WF21):** Any pending approval sends a reminder at 24 hours and escalates to higher authority at 48 hours.

### 5.6 Notifications, Audit, Reporting
- **FR-26 Notifications (WF22):** Key events (e.g., employee created) trigger email, in-app bell notification, and optionally SMS/push.
- **FR-27 Audit Log (WF23):** Every transaction records old value, new value, user, IP address, and browser/user agent.
- **FR-28 Report Generation (WF24):** Users select a report, filter it, preview it, and download/print as PDF or Excel.
- **FR-29 Dashboard Refresh (WF25):** On login, KPIs load for inventory, employees, procurement, alerts, and pending approvals.
- **FR-30 Recovery Calculation (WF26):** On exit/loss/damage, the system looks up items issued, join/leave dates, and the applicable item policy to calculate a recovery amount, subject to Finance verification, resulting in a salary deduction instruction.

### 5.7 Platform Operations
- **FR-31 Backup (WF27):** Daily (midnight) automated database backup, encrypted, sent to cloud storage, retained per policy, and verified.
- **FR-32 Restore (WF28):** Admin-initiated restore from a selected backup, verified, with the application confirmed back online.
- **FR-33 Attachment Handling (WF30):** Uploaded files are virus-scanned, stored, linked to an entity, and made available for preview/download.
- **FR-34 Data Import/Export (WF34):** Bulk import via Excel/CSV template (employees, inventory items, vendors, buildings, departments, positions, categories) with validation and an error report on failure; export to Excel, CSV, or PDF with filters.
- **FR-35 System Configuration & Master Data (WF35):** Centralized management of organization details, buildings, departments, positions, employee categories, inventory categories, item policies (annual allocation, replacement frequency, recovery policy, useful life, recoverable value), notification settings, and approval-workflow configuration (levels, role mapping, escalation, delegation). Master records referenced by transactions cannot be deleted; inactive records cannot be used in new transactions; codes must be unique.

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Multi-tenancy | Complete logical data isolation between organizations; no organization can see another's data. |
| Security | Encrypted passwords and data in transit (TLS); RBAC enforced server-side on every request, not just in the UI; audit trail is immutable and complete. |
| Availability | Target 99.5% for v1 (single-region, low-cost tier — see Architecture doc). Higher SLAs are a paid-tier v2 consideration. |
| Performance | Standard CRUD/dashboard operations respond in under 2 seconds under normal (small/mid organization) load. |
| Cost | Infrastructure cost is a first-class requirement — the stack must run affordably for a small pilot customer and scale predictably, not require an always-on large cluster. |
| Portability | Deployable to AWS or Azure using containerized services and a standard relational database, without vendor-specific code paths. |
| Auditability | Every create/update/delete/approve/export action is logged with who/when/what/before-after. |
| Compliance-readiness | Data export, backup/restore, and audit logging support future compliance requirements (e.g., SOC 2 readiness) even though certification itself is out of scope for v1. |

## 7. Guiding Principle: Simplicity & Cost

Per explicit direction from the business, this product must use the minimum technology footprint needed to satisfy the requirements above:

- One relational database (PostgreSQL) — no polyglot persistence, no separate search/cache/queue services in v1 unless a specific requirement cannot be met without one.
- One backend service (a modular monolith, not microservices) — enterprise module boundaries are enforced in code, not through separate deployable services, until real scaling data justifies splitting a module out.
- One frontend application (a single React SPA), not separate apps per role.
- Managed cloud services over self-managed infrastructure (managed Postgres, managed container hosting) to minimize operational headcount, even though managed services carry a small premium over raw compute — this nets out cheaper once staff time is counted.

Full rationale and the specific low-cost service choices for AWS and Azure are documented in *02-Architecture.md*, *06-Deployment-AWS.md*, and *07-Deployment-Azure.md*.

## 8. Open Questions / Risks

| # | Item | Status |
|---|---|---|
| 1 | Currency/locale requirements for recovery calculations | Assumed single currency (business to confirm which) |
| 2 | Whether SMS/push notifications are required for v1 or v2 | Assumed optional/v2; email + in-app bell are v1 |
| 3 | Subscription/billing model for organizations (WF1 mentions "Subscription Plan") | Not detailed in source spec — assumed out of scope for v1 build (manual/admin-assigned plan flag only) |
| 4 | Expected number of organizations and concurrent users at launch | Needed to size the "low-cost" infra tier correctly — currently assumed small (pilot-scale) |

---
*Next documents: 02-Architecture.md, 03-Data-Model.md, 04-Module-Breakdown.md, 05-API-Specification.md, deployment guides.*
