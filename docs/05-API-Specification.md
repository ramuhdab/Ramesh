# API Specification (v1)
## SPQR Inventory Management

**Version:** 1.0 | **Date:** 2026-07-09
**Base URL:** `/api/v1`
**Auth:** Bearer JWT on every route except `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`. Every route additionally declares a required `module:action` permission checked server-side.

## 1. Auth & Session
| Method | Path | Permission | Description |
|---|---|---|---|
| POST | /auth/login | public | Authenticate, returns access + refresh token |
| POST | /auth/logout | authenticated | Invalidate refresh token |
| POST | /auth/refresh | authenticated (refresh token) | Rotate access token |
| POST | /auth/forgot-password | public | Send reset link (30-min expiry) |
| POST | /auth/reset-password | public (valid token) | Set new password |
| POST | /auth/change-password | authenticated | Change own password (checks last-5 history) |
| POST | /auth/reauth | authenticated | Re-authenticate for sensitive actions |

## 2. Organizations (Super Admin only, except self-view)
| Method | Path | Permission | Description |
|---|---|---|---|
| POST | /organizations | platform:org:create | Onboard organization + first admin |
| GET | /organizations | platform:org:view | List organizations |
| GET | /organizations/:id | platform:org:view / self | Org details |
| PATCH | /organizations/:id | platform:org:update | Update details/plan/status |
| POST | /organizations/:id/activate | public (valid activation token in body) | Activate after email confirmation - the new admin has no session yet, so this is token-authenticated, not permission-gated |

## 3. Users, Roles, Permissions
| Method | Path | Permission | Description |
|---|---|---|---|
| POST | /users | identity:user:create | Create user, assign role(s), send temp password |
| GET | /users | identity:user:view | List org users |
| PATCH | /users/:id | identity:user:update | Update user / lock / unlock |
| POST | /roles | identity:role:create | Create role |
| GET | /roles | identity:role:view | List roles |
| PATCH | /roles/:id/permissions | identity:role:update | Assign module/screen/action permissions |
| POST | /users/:id/roles | identity:role:update | Assign role(s) to user |

## 4. Configuration & Master Data
| Method | Path | Permission | Description |
|---|---|---|---|
| CRUD | /config/buildings | config:master:* | Buildings |
| CRUD | /config/departments | config:master:* | Departments |
| CRUD | /config/positions | config:master:* | Positions |
| CRUD | /config/employee-categories | config:master:* | Employee categories |
| CRUD | /config/inventory-categories | config:master:* | Inventory categories |
| CRUD | /config/item-policies | config:master:* | Allocation/replacement/recovery/useful-life policy |
| CRUD | /config/notification-settings | config:notif:* | Channels, reminder frequency, escalation rules |
| CRUD | /config/approval-workflows | config:approval:* | Levels, role mapping, escalation, delegation |
| CRUD | /config/stock-thresholds | config:master:* | Low/critical stock thresholds per item or category |

*(CRUD = standard GET list, GET :id, POST, PATCH, DELETE — DELETE is a soft-delete guarded by the "referenced records can't be deleted" rule.)*

## 5. Employees
| Method | Path | Permission | Description |
|---|---|---|---|
| POST | /employees | employee:create | Create employee |
| GET | /employees | employee:view | List/search |
| GET | /employees/:id | employee:view | Details incl. inventory + history |
| PATCH | /employees/:id | employee:update | Update profile |
| POST | /employees/:id/transfer | employee:approve | Building/department transfer - gated on the manager-approval permission, not just employee:update |
| POST | /employees/:id/exit/initiate | employee:update | WF5 phase 1: mark as leaving, start the exit checklist |
| POST | /employees/:id/exit/complete | employee:update, requires reauth (frontend) | WF5 phase 2: finalize exit - 409s if any issuance is neither returned nor Finance-verified via Recovery |
| POST | /employees/:id/rehire | employee:create | Reactivate previous employee |
| GET | /employees/:id/history | employee:view | Full event history |

## 6. Vendors
| Method | Path | Permission | Description |
|---|---|---|---|
| POST | /vendors | vendor:create | Create vendor + upload documents |
| GET | /vendors | vendor:view | List vendors incl. performance score |
| POST | /vendors/:id/verify | vendor:approve (Finance) | Finance verification step |
| POST | /vendors/:id/approve | vendor:approve (Management) | Final approval |
| POST | /vendors/:id/ratings | vendor:update | Post-purchase delivery/quality/price rating |

## 7. Inventory
| Method | Path | Permission | Description |
|---|---|---|---|
| CRUD | /inventory/items | inventory:item:* | Item catalog |
| POST | /inventory/goods-receipt | inventory:receive | Store keeper inspection accept/reject |
| POST | /inventory/issue | inventory:issue | Issue to employee (checks annual allocation) |
| POST | /inventory/return | inventory:return | Return + inspection + disposition |
| POST | /inventory/replace | inventory:issue, requires manager approval | Replacement issuance |
| POST | /inventory/adjust | inventory:adjust, requires manager approval | Physical-count adjustment |
| GET | /inventory/alerts | inventory:view | Low/critical stock alerts |

## 8. Loss / Damage / Recovery
| Method | Path | Permission | Description |
|---|---|---|---|
| POST | /inventory/lost | inventory:report | Report lost item |
| POST | /inventory/damaged | inventory:report | Report damaged item |
| POST | /recovery/calculate | recovery:calculate | Run recovery calculation (exit/loss/damage) |
| POST | /recovery/:id/finance-verify | recovery:approve (Finance) | Finance sign-off, produces deduction reference |

## 9. Procurement & Indents
| Method | Path | Permission | Description |
|---|---|---|---|
| POST | /indents | procurement:indent:create | Raise indent |
| GET | /indents | procurement:view | List indents |
| POST | /indents/:id/approve | procurement:approve (per level, role checked against the configured chain) | Advance/reject the indent's approval chain |
| POST | /procurement/requests | procurement:create | Manual/auto procurement request |
| GET | /procurement/requests | procurement:view | List procurement requests |
| POST | /procurement/:id/approve | procurement:approve (per level, role checked against the configured chain) | Advance/reject the approval chain |
| POST | /procurement/:id/cancel | procurement:cancel | Cancel with mandatory reason (only while pending) |
| GET | /procurement/:id/status | procurement:view | Current level, SLA due, full approval history |

**Deviation from the original sketch:** there is no separate `POST /procurement/:id/purchase-order` endpoint. A purchase order is generated automatically the moment a procurement request clears its final approval level (picking the first `approved` vendor on file - see `procurement.service.ts generatePurchaseOrder()`). This was simpler than a manual trigger step and matches WF7's diagram ("Approved -> Purchase Order -> Vendor"). Flagged: vendor selection is a placeholder (first approved vendor, not a real selection/bidding process) - revisit if multiple vendors per category need to be compared.

## 10. Notifications
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | /notifications | authenticated | List own notifications (bell) |
| POST | /notifications/:id/read | authenticated | Mark read |

## 11. Audit
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | /audit-logs | audit:view | Filterable audit trail (entity, user, date range) |

## 12. Reporting & Dashboard
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | /dashboard | authenticated | KPIs: inventory, employees, procurement, alerts, pending approvals |
| GET | /reports/:reportKey | reporting:view | Filtered report data |
| GET | /reports/:reportKey/export | reporting:export | Export as PDF/Excel |

## 13. Import / Export
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | /import/:module/template | data:import | Download template |
| POST | /import/:module | data:import | Upload + validate + import, returns job + error report if any |
| POST | /export/:module | data:export | Generate export file (xlsx/csv/pdf) |

## 14. Attachments
| Method | Path | Permission | Description |
|---|---|---|---|
| POST | /attachments | authenticated | Upload (virus-scanned), linked to entity |
| GET | /attachments/:id | authenticated (entity-scoped) | Preview/download |

## Conventions
- All list endpoints support `?page=&pageSize=&sort=&filter=`.
- All responses: `{ data, meta }` on success, `{ error: { code, message, details } }` on failure.
- All mutating endpoints emit a domain event to the internal event bus (consumed by Notifications + Audit modules) rather than calling those modules directly.

---
*Next: deployment guides (06-Deployment-AWS.md, 07-Deployment-Azure.md).*
