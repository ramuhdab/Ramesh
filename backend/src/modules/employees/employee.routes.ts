import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../utils/asyncHandler";
import { PERMISSIONS } from "../../utils/permissions";
import { AppError } from "../../middleware/errorHandler";
import * as employeeService from "./employee.service";

export const employeeRouter = Router();
employeeRouter.use(authenticate);

function requireOrg(req: any): string {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new AppError(400, "NO_ORGANIZATION_CONTEXT", "This action requires an organization context.");
  return orgId;
}

employeeRouter.post(
  "/",
  requirePermission(PERMISSIONS.EMPLOYEE_CREATE),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      employeeCode: z.string().min(1),
      name: z.string().min(1),
      joiningDate: z.string(),
      buildingId: z.string(),
      positionId: z.string(),
      departmentId: z.string().optional(),
      employeeCategoryId: z.string().optional(),
    });
    const input = schema.parse(req.body);
    const employee = await employeeService.createEmployee({ ...input, organizationId: requireOrg(req), actorUserId: req.user!.sub });
    res.status(201).json({ data: employee });
  })
);

employeeRouter.get(
  "/",
  requirePermission(PERMISSIONS.EMPLOYEE_VIEW),
  asyncHandler(async (req, res) => {
    const employees = await employeeService.listEmployees(requireOrg(req));
    res.json({ data: employees, meta: { count: employees.length } });
  })
);

employeeRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.EMPLOYEE_VIEW),
  asyncHandler(async (req, res) => {
    const employee = await employeeService.getEmployee(requireOrg(req), req.params.id);
    res.json({ data: employee });
  })
);

employeeRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.EMPLOYEE_UPDATE),
  asyncHandler(async (req, res) => {
    const schema = z.object({ name: z.string().min(1).optional(), employeeCategoryId: z.string().optional(), positionId: z.string().optional() });
    const data = schema.parse(req.body);
    const employee = await employeeService.updateEmployee(requireOrg(req), req.params.id, data);
    res.json({ data: employee });
  })
);

employeeRouter.get(
  "/:id/history",
  requirePermission(PERMISSIONS.EMPLOYEE_VIEW),
  asyncHandler(async (req, res) => {
    const employee = await employeeService.getEmployee(requireOrg(req), req.params.id);
    res.json({ data: employee.history });
  })
);

// WF4: manager approval required to transfer - gated by employee:approve.
employeeRouter.post(
  "/:id/transfer",
  requirePermission(PERMISSIONS.EMPLOYEE_APPROVE),
  asyncHandler(async (req, res) => {
    const schema = z.object({ toBuildingId: z.string().optional(), toDepartmentId: z.string().optional() });
    const input = schema.parse(req.body);
    const employee = await employeeService.transferEmployee(requireOrg(req), req.params.id, input, req.user!.sub);
    res.json({ data: employee });
  })
);

employeeRouter.post(
  "/:id/exit/initiate",
  requirePermission(PERMISSIONS.EMPLOYEE_UPDATE),
  asyncHandler(async (req, res) => {
    const { leavingDate } = z.object({ leavingDate: z.string() }).parse(req.body);
    const employee = await employeeService.initiateExit(requireOrg(req), req.params.id, leavingDate, req.user!.sub);
    res.json({ data: employee });
  })
);

// WF5: completing an exit touches payroll-adjacent data (recovery/finance),
// so this is treated as a sensitive action requiring recent re-auth on the
// frontend (see auth.routes.ts /auth/reauth) in addition to the permission check.
employeeRouter.post(
  "/:id/exit/complete",
  requirePermission(PERMISSIONS.EMPLOYEE_UPDATE),
  asyncHandler(async (req, res) => {
    const employee = await employeeService.completeExit(requireOrg(req), req.params.id, req.user!.sub);
    res.json({ data: employee });
  })
);

employeeRouter.post(
  "/:id/rehire",
  requirePermission(PERMISSIONS.EMPLOYEE_CREATE),
  asyncHandler(async (req, res) => {
    const schema = z.object({ joiningDate: z.string(), buildingId: z.string().optional(), positionId: z.string().optional() });
    const input = schema.parse(req.body);
    const employee = await employeeService.rehireEmployee(requireOrg(req), req.params.id, input, req.user!.sub);
    res.json({ data: employee });
  })
);
