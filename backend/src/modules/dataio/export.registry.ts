import { prisma } from "../../lib/prisma";
import * as employeeService from "../employees/employee.service";
import * as vendorService from "../vendors/vendor.service";
import * as inventoryService from "../inventory/inventory.service";
import { TabularColumn } from "../../lib/tabularExport";

export type ExportModuleDef = {
  key: string;
  label: string;
  columns: TabularColumn[];
  fetchRows: (organizationId: string) => Promise<Record<string, unknown>[]>;
};

/**
 * FR-34/WF34 export side - mirrors IMPORT_MODULES' set of modules (raw,
 * near-1:1 table dumps for master data/entities) so an operator can
 * round-trip export -> edit -> import. This is deliberately distinct from
 * the Reporting module's curated reports (report.registry.ts), which join
 * across modules and compute derived figures rather than dumping a table.
 */
export const EXPORT_MODULES: Record<string, ExportModuleDef> = {
  buildings: {
    key: "buildings",
    label: "Buildings",
    columns: [
      { key: "name", header: "Name" },
      { key: "code", header: "Code" },
      { key: "location", header: "Location" },
      { key: "floors", header: "Floors" },
      { key: "isActive", header: "Active" },
    ],
    fetchRows: (organizationId) => prisma.building.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
  },

  departments: {
    key: "departments",
    label: "Departments",
    columns: [
      { key: "name", header: "Name" },
      { key: "code", header: "Code" },
      { key: "isActive", header: "Active" },
    ],
    fetchRows: (organizationId) => prisma.department.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
  },

  positions: {
    key: "positions",
    label: "Positions",
    columns: [
      { key: "name", header: "Name" },
      { key: "isActive", header: "Active" },
    ],
    fetchRows: (organizationId) => prisma.position.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
  },

  "employee-categories": {
    key: "employee-categories",
    label: "Employee Categories",
    columns: [
      { key: "name", header: "Name" },
      { key: "isActive", header: "Active" },
    ],
    fetchRows: (organizationId) => prisma.employeeCategory.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
  },

  "inventory-categories": {
    key: "inventory-categories",
    label: "Inventory Categories",
    columns: [
      { key: "name", header: "Name" },
      { key: "isActive", header: "Active" },
    ],
    fetchRows: (organizationId) => prisma.inventoryCategory.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
  },

  vendors: {
    key: "vendors",
    label: "Vendors",
    columns: [
      { key: "name", header: "Name" },
      { key: "status", header: "Status" },
      { key: "performanceScore", header: "Performance Score" },
      { key: "isActive", header: "Active" },
    ],
    fetchRows: async (organizationId) => vendorService.listVendors(organizationId),
  },

  "inventory-items": {
    key: "inventory-items",
    label: "Inventory Items",
    columns: [
      { key: "itemCode", header: "Item Code" },
      { key: "name", header: "Name" },
      { key: "categoryName", header: "Category" },
      { key: "currentStockQty", header: "Current Stock" },
      { key: "unitCost", header: "Unit Cost" },
    ],
    fetchRows: async (organizationId) => {
      const items = await inventoryService.listItems(organizationId);
      return items.map((item: any) => ({
        itemCode: item.itemCode,
        name: item.name,
        categoryName: item.inventoryCategory?.name ?? "",
        currentStockQty: item.currentStockQty,
        unitCost: item.unitCost,
      }));
    },
  },

  employees: {
    key: "employees",
    label: "Employees",
    columns: [
      { key: "employeeCode", header: "Employee Code" },
      { key: "name", header: "Name" },
      { key: "status", header: "Status" },
      { key: "joiningDate", header: "Joining Date" },
      { key: "leavingDate", header: "Leaving Date" },
      { key: "buildingName", header: "Building" },
      { key: "departmentName", header: "Department" },
      { key: "positionName", header: "Position" },
    ],
    fetchRows: async (organizationId) => {
      const employees = await employeeService.listEmployees(organizationId);
      return employees.map((e: any) => ({
        employeeCode: e.employeeCode,
        name: e.name,
        status: e.status,
        joiningDate: e.joiningDate,
        leavingDate: e.leavingDate,
        buildingName: e.building?.name ?? "",
        departmentName: e.department?.name ?? "",
        positionName: e.position?.name ?? "",
      }));
    },
  },
};

export type ExportModuleKey = keyof typeof EXPORT_MODULES;
