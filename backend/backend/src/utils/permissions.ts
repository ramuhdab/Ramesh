/**
 * Canonical permission strings, "module:action" (per 05-API-Specification.md).
 * Every route declares one of these; the RBAC middleware checks the caller's
 * roles grant it. Keep this list in sync with the seed script
 * (prisma/seed.ts) and with 05-API-Specification.md when new routes are added.
 */
export const PERMISSIONS = {
  PLATFORM_ORG_CREATE: "platform:org:create",
  PLATFORM_ORG_VIEW: "platform:org:view",
  PLATFORM_ORG_UPDATE: "platform:org:update",

  IDENTITY_USER_CREATE: "identity:user:create",
  IDENTITY_USER_VIEW: "identity:user:view",
  IDENTITY_USER_UPDATE: "identity:user:update",

  IDENTITY_ROLE_CREATE: "identity:role:create",
  IDENTITY_ROLE_VIEW: "identity:role:view",
  IDENTITY_ROLE_UPDATE: "identity:role:update",

  CONFIG_MASTER_CREATE: "config:master:create",
  CONFIG_MASTER_VIEW: "config:master:view",
  CONFIG_MASTER_UPDATE: "config:master:update",
  CONFIG_MASTER_DELETE: "config:master:delete",

  CONFIG_NOTIF_CREATE: "config:notif:create",
  CONFIG_NOTIF_VIEW: "config:notif:view",
  CONFIG_NOTIF_UPDATE: "config:notif:update",
  CONFIG_NOTIF_DELETE: "config:notif:delete",

  CONFIG_APPROVAL_CREATE: "config:approval:create",
  CONFIG_APPROVAL_VIEW: "config:approval:view",
  CONFIG_APPROVAL_UPDATE: "config:approval:update",
  CONFIG_APPROVAL_DELETE: "config:approval:delete",

  AUDIT_VIEW: "audit:view",

  EMPLOYEE_CREATE: "employee:create",
  EMPLOYEE_VIEW: "employee:view",
  EMPLOYEE_UPDATE: "employee:update",
  EMPLOYEE_APPROVE: "employee:approve", // manager sign-off on transfers

  VENDOR_CREATE: "vendor:create",
  VENDOR_VIEW: "vendor:view",
  VENDOR_UPDATE: "vendor:update",
  VENDOR_APPROVE: "vendor:approve", // Finance verification + management approval

  INVENTORY_ITEM_CREATE: "inventory:item:create",
  INVENTORY_ITEM_VIEW: "inventory:item:view",
  INVENTORY_ITEM_UPDATE: "inventory:item:update",
  INVENTORY_RECEIVE: "inventory:receive",
  INVENTORY_ISSUE: "inventory:issue",
  INVENTORY_RETURN: "inventory:return",
  INVENTORY_ADJUST: "inventory:adjust", // requires manager approval, enforced at the route
  INVENTORY_REPORT: "inventory:report", // report lost/damaged items

  RECOVERY_CALCULATE: "recovery:calculate",
  RECOVERY_APPROVE: "recovery:approve", // Finance sign-off

  PROCUREMENT_CREATE: "procurement:create",
  PROCUREMENT_VIEW: "procurement:view",
  PROCUREMENT_APPROVE: "procurement:approve",
  PROCUREMENT_CANCEL: "procurement:cancel",
  PROCUREMENT_INDENT_CREATE: "procurement:indent:create",

  // Reporting & Dashboard (FR-28/29, WF24/25). GET /dashboard itself only
  // requires authentication (every role needs its own dashboard) - these two
  // gate the curated /reports/:reportKey endpoints specifically, per
  // 05-API-Specification.md Section 12.
  REPORTING_VIEW: "reporting:view",
  REPORTING_EXPORT: "reporting:export",

  // Data Import/Export (FR-34, WF34) - 05-API-Specification.md Section 13.
  DATA_IMPORT: "data:import",
  DATA_EXPORT: "data:export",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export type PermissionValue = (typeof PERMISSIONS)[PermissionKey];

/** Roles seeded automatically for every new organization (FR-1). */
export const SYSTEM_ROLES = {
  ORG_ADMIN: "Organization Administrator",
  HR: "HR",
  STORE_KEEPER: "Store Keeper",
  TECH_MANAGER: "Tech Manager",
  SENIOR_MANAGER: "Senior Manager",
  FINANCE: "Finance",
  MANAGING_DIRECTOR: "Managing Director",
  EMPLOYEE: "Employee",
} as const;

export const SUPER_ADMIN_ROLE = "Sparquer Super Administrator";
