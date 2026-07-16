import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import { TabularColumn } from "../../lib/tabularExport";

export type ReportFilters = { fromDate?: string; toDate?: string; [key: string]: string | undefined };

export type ReportDef = {
  key: string;
  label: string;
  columns: TabularColumn[];
  fetchRows: (organizationId: string, filters: ReportFilters) => Promise<Record<string, unknown>[]>;
};

/** Parses a filter value as a date, throwing a clear 400 instead of letting an invalid string reach Prisma as `Invalid Date` (which surfaces as a raw 500 - flagged in code review). */
function parseFilterDate(value: string, fieldLabel: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AppError(400, "INVALID_DATE_FILTER", `"${fieldLabel}" is not a valid date: "${value}".`);
  }
  return d;
}

function dateRangeWhere(filters: ReportFilters, field: string) {
  if (!filters.fromDate && !filters.toDate) return {};
  const range: { gte?: Date; lte?: Date } = {};
  if (filters.fromDate) range.gte = parseFilterDate(filters.fromDate, "fromDate");
  if (filters.toDate) range.lte = parseFilterDate(filters.toDate, "toDate");
  return { [field]: range };
}

/**
 * FR-28/WF24 Report Generation: curated, cross-module views (as opposed to
 * the Data Import/Export module's raw per-table dumps - see
 * dataio/export.registry.ts). Each report accepts the generic `fromDate`/
 * `toDate` filters plus whatever module-specific filter it documents below;
 * unrecognized filter keys are simply ignored rather than rejected, so the
 * frontend can pass a shared filter-bar shape across all report screens.
 */
export const REPORT_DEFS: Record<string, ReportDef> = {
  "inventory-stock": {
    key: "inventory-stock",
    label: "Inventory Stock Report",
    columns: [
      { key: "itemCode", header: "Item Code" },
      { key: "name", header: "Name" },
      { key: "categoryName", header: "Category" },
      { key: "currentStockQty", header: "Current Stock" },
      { key: "unitCost", header: "Unit Cost" },
    ],
    // Filter: categoryId (optional) - restrict to one inventory category.
    fetchRows: async (organizationId, filters) => {
      const items = await prisma.inventoryItem.findMany({
        where: { organizationId, isActive: true, ...(filters.categoryId ? { inventoryCategoryId: filters.categoryId } : {}) },
        include: { inventoryCategory: true },
        orderBy: { itemCode: "asc" },
      });
      return items.map((item) => ({
        itemCode: item.itemCode,
        name: item.name,
        categoryName: item.inventoryCategory?.name ?? "",
        currentStockQty: item.currentStockQty,
        unitCost: item.unitCost,
      }));
    },
  },

  "employee-issuance": {
    key: "employee-issuance",
    label: "Employee Issuance Report",
    columns: [
      { key: "employeeCode", header: "Employee Code" },
      { key: "employeeName", header: "Employee Name" },
      { key: "itemCode", header: "Item Code" },
      { key: "itemName", header: "Item Name" },
      { key: "quantity", header: "Quantity" },
      { key: "issuedAt", header: "Issued At" },
    ],
    // Filters: fromDate/toDate (issuedAt), employeeId (optional).
    fetchRows: async (organizationId, filters) => {
      const issuances = await prisma.itemIssuance.findMany({
        where: {
          organizationId,
          ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
          ...dateRangeWhere(filters, "issuedAt"),
        },
        include: { employee: true, inventoryItem: true },
        orderBy: { issuedAt: "desc" },
      });
      return issuances.map((i) => ({
        employeeCode: i.employee.employeeCode,
        employeeName: i.employee.name,
        itemCode: i.inventoryItem.itemCode,
        itemName: i.inventoryItem.name,
        quantity: i.quantity,
        issuedAt: i.issuedAt,
      }));
    },
  },

  "procurement-status": {
    key: "procurement-status",
    label: "Procurement Status Report",
    columns: [
      { key: "id", header: "ID" },
      { key: "sourceType", header: "Source" },
      { key: "quantity", header: "Quantity" },
      { key: "status", header: "Status" },
      { key: "currentApprovalLevel", header: "Approval Level" },
      { key: "createdAt", header: "Created At" },
    ],
    // Filter: status (optional, e.g. "pending"/"approved"/"rejected"/"cancelled").
    fetchRows: async (organizationId, filters) => {
      const requests = await prisma.procurementRequest.findMany({
        where: { organizationId, ...(filters.status ? { status: filters.status } : {}), ...dateRangeWhere(filters, "createdAt") },
        orderBy: { createdAt: "desc" },
      });
      return requests.map((r) => ({
        id: r.id,
        sourceType: r.sourceType,
        quantity: r.quantity,
        status: r.status,
        currentApprovalLevel: r.currentApprovalLevel,
        createdAt: r.createdAt,
      }));
    },
  },

  "vendor-performance": {
    key: "vendor-performance",
    label: "Vendor Performance Report",
    columns: [
      { key: "name", header: "Vendor" },
      { key: "status", header: "Status" },
      { key: "performanceScore", header: "Performance Score" },
      { key: "ratingsCount", header: "Ratings Recorded" },
    ],
    fetchRows: async (organizationId) => {
      const vendors = await prisma.vendor.findMany({
        where: { organizationId },
        include: { _count: { select: { ratings: true } } },
        orderBy: { name: "asc" },
      });
      return vendors.map((v) => ({
        name: v.name,
        status: v.status,
        performanceScore: v.performanceScore,
        ratingsCount: v._count.ratings,
      }));
    },
  },

  "recovery-deductions": {
    key: "recovery-deductions",
    label: "Recovery & Deduction Report",
    columns: [
      { key: "employeeCode", header: "Employee Code" },
      { key: "employeeName", header: "Employee Name" },
      { key: "sourceType", header: "Source" },
      { key: "calculatedAmount", header: "Calculated Amount" },
      { key: "financeVerifiedAt", header: "Finance Verified At" },
      { key: "salaryDeductionRef", header: "Deduction Reference" },
    ],
    // Filters: fromDate/toDate (createdAt), verifiedOnly=true (only Finance-verified rows).
    fetchRows: async (organizationId, filters) => {
      const calcs = await prisma.recoveryCalculation.findMany({
        where: {
          organizationId,
          ...(filters.verifiedOnly === "true" ? { financeVerifiedAt: { not: null } } : {}),
          ...dateRangeWhere(filters, "createdAt"),
        },
        include: { employee: true },
        orderBy: { createdAt: "desc" },
      });
      return calcs.map((c) => ({
        employeeCode: c.employee.employeeCode,
        employeeName: c.employee.name,
        sourceType: c.sourceType,
        calculatedAmount: c.calculatedAmount,
        financeVerifiedAt: c.financeVerifiedAt,
        salaryDeductionRef: c.salaryDeductionRef,
      }));
    },
  },
};

export type ReportKey = keyof typeof REPORT_DEFS;
