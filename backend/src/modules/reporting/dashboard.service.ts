import { prisma } from "../../lib/prisma";
import { getStockAlerts } from "../inventory/inventory.service";
import { countPendingApprovalsForRoles } from "../procurement/approval.service";

/**
 * FR-29/WF25 Dashboard Refresh: on login, KPIs load for inventory,
 * employees, procurement, alerts, and pending approvals. GET /dashboard only
 * requires authentication (every role gets a dashboard - see
 * 05-API-Specification.md Section 12), so this aggregates read-only counts
 * scoped to the caller's organization, plus the "pending approvals for me"
 * figure scoped to their own roles.
 */
export async function getDashboard(organizationId: string, userRoles: string[]) {
  const [totalEmployees, activeEmployees, totalItems, pendingProcurement, pendingIndents, vendorCounts, stockAlerts, pendingApprovalsForMe] =
    await Promise.all([
      prisma.employee.count({ where: { organizationId } }),
      prisma.employee.count({ where: { organizationId, status: "active" } }),
      prisma.inventoryItem.count({ where: { organizationId, isActive: true } }),
      prisma.procurementRequest.count({ where: { organizationId, status: "pending" } }),
      prisma.indent.count({ where: { organizationId, status: "pending" } }),
      prisma.vendor.groupBy({ by: ["status"], where: { organizationId }, _count: true }),
      getStockAlerts(organizationId),
      countPendingApprovalsForRoles(organizationId, userRoles),
    ]);

  return {
    employees: { total: totalEmployees, active: activeEmployees },
    inventory: {
      activeItemCount: totalItems,
      lowStockCount: stockAlerts.filter((a) => a.level === "low").length,
      criticalStockCount: stockAlerts.filter((a) => a.level === "critical").length,
      alerts: stockAlerts,
    },
    procurement: { pendingRequests: pendingProcurement, pendingIndents },
    vendors: Object.fromEntries(vendorCounts.map((v) => [v.status, v._count as unknown as number])),
    approvals: { pendingForMe: pendingApprovalsForMe },
  };
}
