import { Router } from "express";
import { z, ZodTypeAny } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../middleware/errorHandler";
import { eventBus } from "../../lib/eventBus";

/**
 * Generic CRUD factory for the master-data / configuration entities defined
 * in WF35 (System Configuration & Master Data Management Workflow):
 * Buildings, Departments, Positions, Employee Categories, Inventory
 * Categories, Item Policies, Notification Settings, Approval Workflows,
 * Stock Thresholds. All nine share the same shape of rule set (BRD FR-35):
 *   - scoped to organization
 *   - codes/names unique within the organization
 *   - soft-delete only (is_active = false) - referenced records are never
 *     hard-deleted; Postgres foreign-key constraints back this up as a
 *     safety net if a hard delete is ever attempted directly
 *   - changes are audited (via the domain-event bus, not a direct write here)
 *
 * Building a single factory instead of 9 near-identical route files keeps
 * the module small and consistent, per the 04-Module-Breakdown.md instruction
 * to avoid duplicating boilerplate.
 */

type Delegate = {
  findMany: (args: any) => Promise<any[]>;
  findFirst: (args: any) => Promise<any>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
};

export function createMasterDataRouter(options: {
  entityName: string; // e.g. "Building" - used in error messages/events
  delegate: Delegate;
  createSchema: ZodTypeAny;
  updateSchema: ZodTypeAny;
  viewPermission: string;
  createPermission: string;
  updatePermission: string;
  deletePermission: string;
  /** field(s) that must be unique within an organization, e.g. ["code"] or ["name"] */
  uniqueFields: string[];
}) {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/",
    requirePermission(options.viewPermission),
    asyncHandler(async (req, res) => {
      const orgId = requireOrg(req);
      const items = await options.delegate.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" } });
      res.json({ data: items, meta: { count: items.length } });
    })
  );

  router.get(
    "/:id",
    requirePermission(options.viewPermission),
    asyncHandler(async (req, res) => {
      const orgId = requireOrg(req);
      const item = await options.delegate.findFirst({ where: { id: req.params.id, organizationId: orgId } });
      if (!item) throw new AppError(404, "NOT_FOUND", `${options.entityName} not found.`);
      res.json({ data: item });
    })
  );

  router.post(
    "/",
    requirePermission(options.createPermission),
    asyncHandler(async (req, res) => {
      const orgId = requireOrg(req);
      const input = options.createSchema.parse(req.body);
      await assertUnique(options, orgId, input);
      const created = await options.delegate.create({ data: { ...input, organizationId: orgId } });
      eventBus.publish({ type: `config.${options.entityName.toLowerCase()}.created`, organizationId: orgId, actorUserId: req.user!.sub, payload: created });
      res.status(201).json({ data: created });
    })
  );

  router.patch(
    "/:id",
    requirePermission(options.updatePermission),
    asyncHandler(async (req, res) => {
      const orgId = requireOrg(req);
      const existing = await options.delegate.findFirst({ where: { id: req.params.id, organizationId: orgId } });
      if (!existing) throw new AppError(404, "NOT_FOUND", `${options.entityName} not found.`);
      const input = options.updateSchema.parse(req.body);
      if (Object.keys(input).some((k) => options.uniqueFields.includes(k))) {
        await assertUnique(options, orgId, input, req.params.id);
      }
      const updated = await options.delegate.update({ where: { id: req.params.id }, data: input });
      eventBus.publish({ type: `config.${options.entityName.toLowerCase()}.updated`, organizationId: orgId, actorUserId: req.user!.sub, payload: { before: existing, after: updated } });
      res.json({ data: updated });
    })
  );

  // Soft-delete only (BRD FR-35: "Master records referenced by transactions cannot be deleted").
  router.delete(
    "/:id",
    requirePermission(options.deletePermission),
    asyncHandler(async (req, res) => {
      const orgId = requireOrg(req);
      const existing = await options.delegate.findFirst({ where: { id: req.params.id, organizationId: orgId } });
      if (!existing) throw new AppError(404, "NOT_FOUND", `${options.entityName} not found.`);
      const updated = await options.delegate.update({ where: { id: req.params.id }, data: { isActive: false } });
      eventBus.publish({ type: `config.${options.entityName.toLowerCase()}.deactivated`, organizationId: orgId, actorUserId: req.user!.sub, payload: { id: req.params.id } });
      res.json({ data: updated });
    })
  );

  return router;
}

async function assertUnique(
  options: { entityName: string; delegate: Delegate; uniqueFields: string[] },
  organizationId: string,
  input: Record<string, unknown>,
  excludeId?: string
) {
  for (const field of options.uniqueFields) {
    if (input[field] === undefined) continue;
    const clash = await options.delegate.findFirst({
      where: { organizationId, [field]: input[field], ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    });
    if (clash) {
      throw new AppError(409, "DUPLICATE_MASTER_RECORD", `${options.entityName} with this ${field} already exists.`);
    }
  }
}

function requireOrg(req: any): string {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new AppError(400, "NO_ORGANIZATION_CONTEXT", "This action requires an organization context.");
  return orgId;
}
