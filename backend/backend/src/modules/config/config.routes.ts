import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { PERMISSIONS } from "../../utils/permissions";
import { createMasterDataRouter } from "./masterData.factory";

export const configRouter = Router();

// Distinct create/update/delete permissions (not one shared "write" permission) so
// a role can be granted e.g. create-only without implicitly getting delete too.
const masterPerms = {
  view: PERMISSIONS.CONFIG_MASTER_VIEW,
  create: PERMISSIONS.CONFIG_MASTER_CREATE,
  update: PERMISSIONS.CONFIG_MASTER_UPDATE,
  delete: PERMISSIONS.CONFIG_MASTER_DELETE,
};
const notifPerms = {
  view: PERMISSIONS.CONFIG_NOTIF_VIEW,
  create: PERMISSIONS.CONFIG_NOTIF_CREATE,
  update: PERMISSIONS.CONFIG_NOTIF_UPDATE,
  delete: PERMISSIONS.CONFIG_NOTIF_DELETE,
};
const approvalPerms = {
  view: PERMISSIONS.CONFIG_APPROVAL_VIEW,
  create: PERMISSIONS.CONFIG_APPROVAL_CREATE,
  update: PERMISSIONS.CONFIG_APPROVAL_UPDATE,
  delete: PERMISSIONS.CONFIG_APPROVAL_DELETE,
};

configRouter.use(
  "/buildings",
  createMasterDataRouter({
    entityName: "Building",
    delegate: prisma.building,
    uniqueFields: ["code"],
    viewPermission: masterPerms.view,
    createPermission: masterPerms.create,
    updatePermission: masterPerms.update,
    deletePermission: masterPerms.delete,
    createSchema: z.object({ name: z.string().min(1), code: z.string().min(1), location: z.string().optional(), floors: z.number().int().optional() }),
    updateSchema: z.object({ name: z.string().min(1).optional(), code: z.string().min(1).optional(), location: z.string().optional(), floors: z.number().int().optional(), isActive: z.boolean().optional() }),
  })
);

configRouter.use(
  "/departments",
  createMasterDataRouter({
    entityName: "Department",
    delegate: prisma.department,
    uniqueFields: ["name"],
    viewPermission: masterPerms.view,
    createPermission: masterPerms.create,
    updatePermission: masterPerms.update,
    deletePermission: masterPerms.delete,
    createSchema: z.object({ name: z.string().min(1), code: z.string().optional() }),
    updateSchema: z.object({ name: z.string().min(1).optional(), code: z.string().optional(), isActive: z.boolean().optional() }),
  })
);

configRouter.use(
  "/positions",
  createMasterDataRouter({
    entityName: "Position",
    delegate: prisma.position,
    uniqueFields: ["name"],
    viewPermission: masterPerms.view,
    createPermission: masterPerms.create,
    updatePermission: masterPerms.update,
    deletePermission: masterPerms.delete,
    createSchema: z.object({ name: z.string().min(1) }),
    updateSchema: z.object({ name: z.string().min(1).optional(), isActive: z.boolean().optional() }),
  })
);

configRouter.use(
  "/employee-categories",
  createMasterDataRouter({
    entityName: "Employee Category",
    delegate: prisma.employeeCategory,
    uniqueFields: ["name"],
    viewPermission: masterPerms.view,
    createPermission: masterPerms.create,
    updatePermission: masterPerms.update,
    deletePermission: masterPerms.delete,
    createSchema: z.object({ name: z.string().min(1) }),
    updateSchema: z.object({ name: z.string().min(1).optional(), isActive: z.boolean().optional() }),
  })
);

configRouter.use(
  "/inventory-categories",
  createMasterDataRouter({
    entityName: "Inventory Category",
    delegate: prisma.inventoryCategory,
    uniqueFields: ["name"],
    viewPermission: masterPerms.view,
    createPermission: masterPerms.create,
    updatePermission: masterPerms.update,
    deletePermission: masterPerms.delete,
    createSchema: z.object({ name: z.string().min(1) }),
    updateSchema: z.object({ name: z.string().min(1).optional(), isActive: z.boolean().optional() }),
  })
);

configRouter.use(
  "/item-policies",
  createMasterDataRouter({
    entityName: "Item Policy",
    delegate: prisma.itemPolicy,
    uniqueFields: [],
    viewPermission: masterPerms.view,
    createPermission: masterPerms.create,
    updatePermission: masterPerms.update,
    deletePermission: masterPerms.delete,
    createSchema: z.object({
      inventoryCategoryId: z.string(),
      annualAllocation: z.number().int().min(0),
      replacementFrequency: z.string().optional(),
      recoveryPolicy: z.record(z.unknown()).optional(),
      usefulLifeMonths: z.number().int().optional(),
      recoverableValue: z.number().optional(),
    }),
    updateSchema: z.object({
      annualAllocation: z.number().int().min(0).optional(),
      replacementFrequency: z.string().optional(),
      recoveryPolicy: z.record(z.unknown()).optional(),
      usefulLifeMonths: z.number().int().optional(),
      recoverableValue: z.number().optional(),
      isActive: z.boolean().optional(),
    }),
  })
);

configRouter.use(
  "/notification-settings",
  createMasterDataRouter({
    entityName: "Notification Setting",
    delegate: prisma.notificationSetting,
    uniqueFields: [],
    viewPermission: notifPerms.view,
    createPermission: notifPerms.create,
    updatePermission: notifPerms.update,
    deletePermission: notifPerms.delete,
    createSchema: z.object({ channel: z.enum(["email", "bell", "sms", "push"]), reminderFrequency: z.string().optional(), escalationRules: z.record(z.unknown()).optional() }),
    updateSchema: z.object({ reminderFrequency: z.string().optional(), escalationRules: z.record(z.unknown()).optional(), isActive: z.boolean().optional() }),
  })
);

configRouter.use(
  "/approval-workflows",
  createMasterDataRouter({
    entityName: "Approval Workflow",
    delegate: prisma.approvalWorkflow,
    uniqueFields: [],
    viewPermission: approvalPerms.view,
    createPermission: approvalPerms.create,
    updatePermission: approvalPerms.update,
    deletePermission: approvalPerms.delete,
    createSchema: z.object({
      processType: z.enum(["procurement", "indent"]),
      levels: z.array(z.string()).min(1),
      escalationHours: z.number().int().min(1).default(24),
      delegationRules: z.record(z.unknown()).optional(),
    }),
    updateSchema: z.object({
      levels: z.array(z.string()).min(1).optional(),
      escalationHours: z.number().int().min(1).optional(),
      delegationRules: z.record(z.unknown()).optional(),
      isActive: z.boolean().optional(),
    }),
  })
);

configRouter.use(
  "/stock-thresholds",
  createMasterDataRouter({
    entityName: "Stock Threshold",
    delegate: prisma.stockThreshold,
    uniqueFields: [],
    viewPermission: masterPerms.view,
    createPermission: masterPerms.create,
    updatePermission: masterPerms.update,
    deletePermission: masterPerms.delete,
    createSchema: z.object({ inventoryItemId: z.string().optional(), lowStockQty: z.number().int().min(0).default(20), criticalStockQty: z.number().int().min(0).default(5) }),
    updateSchema: z.object({ lowStockQty: z.number().int().min(0).optional(), criticalStockQty: z.number().int().min(0).optional() }),
  })
);
