import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import * as employeeService from "../employees/employee.service";
import * as vendorService from "../vendors/vendor.service";
import * as inventoryService from "../inventory/inventory.service";

export type ImportColumnType = "string" | "number" | "date" | "boolean";
export type ImportColumn = { key: string; header: string; required: boolean; type: ImportColumnType };

export type ImportModuleDef = {
  key: string;
  label: string;
  columns: ImportColumn[];
  /** Creates one row. Throw a plain Error (or AppError) with a human-readable message on failure - the row is skipped and the message recorded in the job's error list. */
  createRow: (organizationId: string, row: Record<string, unknown>, actorUserId: string) => Promise<void>;
};

/**
 * FR-34/WF34: bulk import, one definition per importable module. Deliberately
 * delegates row creation to each module's own service function
 * (employeeService.createEmployee, vendorService.createVendor,
 * inventoryService.createItem) rather than writing directly to Prisma here -
 * that way an imported row goes through exactly the same validation,
 * uniqueness checks, and event-bus publishing as a row created through the
 * normal UI, and this engine never drifts out of sync with those modules'
 * business rules (several of which were fixed by code review in
 * docs/modules/02-transactional-modules.md).
 *
 * Master-data modules (buildings/departments/positions/categories) have no
 * dedicated service layer of their own (they're served by the generic
 * masterData.factory.ts CRUD factory instead - see config.routes.ts), so
 * their createRow talks to Prisma directly, mirroring that factory's
 * uniqueness rule (FR-35: "codes must be unique").
 */

async function assertMasterDataUnique(
  model: { findFirst: (args: any) => Promise<any> },
  organizationId: string,
  field: string,
  value: string,
  entityName: string
) {
  const clash = await model.findFirst({ where: { organizationId, [field]: value } });
  if (clash) throw new AppError(409, "DUPLICATE_MASTER_RECORD", `${entityName} with this ${field} already exists.`);
}

export const IMPORT_MODULES: Record<string, ImportModuleDef> = {
  buildings: {
    key: "buildings",
    label: "Buildings",
    columns: [
      { key: "name", header: "Name", required: true, type: "string" },
      { key: "code", header: "Code", required: true, type: "string" },
      { key: "location", header: "Location", required: false, type: "string" },
      { key: "floors", header: "Floors", required: false, type: "number" },
    ],
    createRow: async (organizationId, row) => {
      await assertMasterDataUnique(prisma.building, organizationId, "code", row.code as string, "Building");
      await prisma.building.create({
        data: { organizationId, name: row.name as string, code: row.code as string, location: row.location as string | undefined, floors: row.floors as number | undefined },
      });
    },
  },

  departments: {
    key: "departments",
    label: "Departments",
    columns: [
      { key: "name", header: "Name", required: true, type: "string" },
      { key: "code", header: "Code", required: false, type: "string" },
    ],
    createRow: async (organizationId, row) => {
      await assertMasterDataUnique(prisma.department, organizationId, "name", row.name as string, "Department");
      await prisma.department.create({ data: { organizationId, name: row.name as string, code: row.code as string | undefined } });
    },
  },

  positions: {
    key: "positions",
    label: "Positions",
    columns: [{ key: "name", header: "Name", required: true, type: "string" }],
    createRow: async (organizationId, row) => {
      await assertMasterDataUnique(prisma.position, organizationId, "name", row.name as string, "Position");
      await prisma.position.create({ data: { organizationId, name: row.name as string } });
    },
  },

  "employee-categories": {
    key: "employee-categories",
    label: "Employee Categories",
    columns: [{ key: "name", header: "Name", required: true, type: "string" }],
    createRow: async (organizationId, row) => {
      await assertMasterDataUnique(prisma.employeeCategory, organizationId, "name", row.name as string, "Employee Category");
      await prisma.employeeCategory.create({ data: { organizationId, name: row.name as string } });
    },
  },

  "inventory-categories": {
    key: "inventory-categories",
    label: "Inventory Categories",
    columns: [{ key: "name", header: "Name", required: true, type: "string" }],
    createRow: async (organizationId, row) => {
      await assertMasterDataUnique(prisma.inventoryCategory, organizationId, "name", row.name as string, "Inventory Category");
      await prisma.inventoryCategory.create({ data: { organizationId, name: row.name as string } });
    },
  },

  vendors: {
    key: "vendors",
    label: "Vendors",
    columns: [{ key: "name", header: "Vendor Name", required: true, type: "string" }],
    createRow: async (organizationId, row, actorUserId) => {
      await vendorService.createVendor(organizationId, { name: row.name as string }, actorUserId);
    },
  },

  "inventory-items": {
    key: "inventory-items",
    label: "Inventory Items",
    columns: [
      { key: "itemCode", header: "Item Code", required: true, type: "string" },
      { key: "name", header: "Item Name", required: true, type: "string" },
      { key: "inventoryCategoryName", header: "Inventory Category", required: false, type: "string" },
      { key: "unitCost", header: "Unit Cost", required: false, type: "number" },
    ],
    createRow: async (organizationId, row) => {
      let inventoryCategoryId: string | undefined;
      if (row.inventoryCategoryName) {
        const category = await prisma.inventoryCategory.findFirst({
          where: { organizationId, name: row.inventoryCategoryName as string, isActive: true },
        });
        if (!category) throw new Error(`Inventory category "${row.inventoryCategoryName}" was not found (check spelling, and that it is active).`);
        inventoryCategoryId = category.id;
      }
      await inventoryService.createItem(organizationId, {
        itemCode: row.itemCode as string,
        name: row.name as string,
        inventoryCategoryId,
        unitCost: row.unitCost as number | undefined,
      });
    },
  },

  employees: {
    key: "employees",
    label: "Employees",
    columns: [
      { key: "employeeCode", header: "Employee Code", required: true, type: "string" },
      { key: "name", header: "Name", required: true, type: "string" },
      { key: "joiningDate", header: "Joining Date", required: true, type: "date" },
      { key: "buildingCode", header: "Building Code", required: true, type: "string" },
      { key: "positionName", header: "Position", required: true, type: "string" },
      { key: "departmentName", header: "Department", required: false, type: "string" },
      { key: "employeeCategoryName", header: "Employee Category", required: false, type: "string" },
    ],
    createRow: async (organizationId, row, actorUserId) => {
      // The import file references master data by human-readable name/code
      // (an operator preparing a spreadsheet doesn't know internal UUIDs) -
      // resolve those to IDs here, then hand off to employeeService.createEmployee
      // for the actual creation + business-rule validation.
      const building = await prisma.building.findFirst({ where: { organizationId, code: row.buildingCode as string, isActive: true } });
      if (!building) throw new Error(`Building code "${row.buildingCode}" was not found (check spelling, and that it is active).`);

      const position = await prisma.position.findFirst({ where: { organizationId, name: row.positionName as string, isActive: true } });
      if (!position) throw new Error(`Position "${row.positionName}" was not found (check spelling, and that it is active).`);

      let departmentId: string | undefined;
      if (row.departmentName) {
        const department = await prisma.department.findFirst({ where: { organizationId, name: row.departmentName as string, isActive: true } });
        if (!department) throw new Error(`Department "${row.departmentName}" was not found (check spelling, and that it is active).`);
        departmentId = department.id;
      }

      let employeeCategoryId: string | undefined;
      if (row.employeeCategoryName) {
        const category = await prisma.employeeCategory.findFirst({ where: { organizationId, name: row.employeeCategoryName as string, isActive: true } });
        if (!category) throw new Error(`Employee category "${row.employeeCategoryName}" was not found (check spelling, and that it is active).`);
        employeeCategoryId = category.id;
      }

      await employeeService.createEmployee({
        organizationId,
        employeeCode: row.employeeCode as string,
        name: row.name as string,
        joiningDate: row.joiningDate as string,
        buildingId: building.id,
        positionId: position.id,
        departmentId,
        employeeCategoryId,
        actorUserId,
      });
    },
  },
};

export type ImportModuleKey = keyof typeof IMPORT_MODULES;
