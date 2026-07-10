import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { eventBus } from "../../lib/eventBus";
import { AppError } from "../../middleware/errorHandler";
import { parseCsv } from "../../lib/csv.util";
import { IMPORT_MODULES, ImportColumn, ImportModuleDef } from "./import.registry";

const MAX_IMPORT_ROWS = 2000; // keeps a single request bounded on the low-cost single-instance deployment (no background job queue - see 02-Architecture.md)

export function getImportModuleDef(moduleKey: string): ImportModuleDef {
  const def = IMPORT_MODULES[moduleKey];
  if (!def) throw new AppError(404, "UNKNOWN_IMPORT_MODULE", `"${moduleKey}" is not an importable module.`);
  return def;
}

/** GET /import/:module/template - a blank workbook with the exact headers `runImport` expects back. */
export async function buildTemplateWorkbook(moduleKey: string): Promise<Buffer> {
  const def = getImportModuleDef(moduleKey);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(def.label.slice(0, 31));
  sheet.addRow(def.columns.map((c) => c.header + (c.required ? " *" : "")));
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((col) => (col.width = 22));
  const written = await workbook.xlsx.writeBuffer();
  return Buffer.from(written as any);
}

function isCsvFile(mimeType: string | undefined, originalName: string): boolean {
  return mimeType === "text/csv" || originalName.toLowerCase().endsWith(".csv");
}

/**
 * Parses the uploaded file into row objects keyed by column `key`, matching
 * header cells by text (case-insensitive, tolerant of the " *" required
 * marker our own template adds) rather than by fixed column position - this
 * way a reordered or partially-filled-in template still imports correctly.
 */
async function parseRows(columns: ImportColumn[], buffer: Buffer, mimeType: string | undefined, originalName: string): Promise<Record<string, string>[]> {
  let headerRow: string[];
  let dataRows: string[][];

  if (isCsvFile(mimeType, originalName)) {
    const parsed = parseCsv(buffer.toString("utf-8"));
    if (parsed.length === 0) return [];
    [headerRow, ...dataRows] = parsed;
  } else {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch {
      // A corrupted workbook, or a file that isn't really xlsx (e.g. a CSV
      // renamed/mistyped as .xlsx), throws a raw ExcelJS exception - without
      // this catch it would surface as a generic 500 instead of a clear 400
      // explaining the file couldn't be read (flagged in code review).
      throw new AppError(400, "INVALID_FILE_FORMAT", "The uploaded file could not be read as an Excel workbook. Check that it is a valid .xlsx file, or upload a .csv instead.");
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new AppError(400, "EMPTY_FILE", "The uploaded file has no worksheet.");
    const rows: string[][] = [];
    sheet.eachRow((row) => {
      const values = (row.values as unknown[]).slice(1); // ExcelJS row.values is 1-indexed; index 0 is always empty
      rows.push(values.map((v) => (v === null || v === undefined ? "" : String(v))));
    });
    if (rows.length === 0) return [];
    [headerRow, ...dataRows] = rows;
  }

  const normalizedHeaders = headerRow.map((h) => h.replace(/\s*\*\s*$/, "").trim().toLowerCase());
  const colIndexByKey = new Map<string, number>();
  for (const col of columns) {
    const idx = normalizedHeaders.indexOf(col.header.toLowerCase());
    if (idx !== -1) colIndexByKey.set(col.key, idx);
  }

  return dataRows
    .filter((r) => r.some((cell) => cell !== "" && cell !== undefined))
    .map((r) => {
      const obj: Record<string, string> = {};
      for (const col of columns) {
        const idx = colIndexByKey.get(col.key);
        obj[col.key] = idx === undefined ? "" : (r[idx] ?? "").toString().trim();
      }
      return obj;
    });
}

function coerceAndValidate(columns: ImportColumn[], row: Record<string, string>): { value?: Record<string, unknown>; error?: string } {
  const value: Record<string, unknown> = {};
  for (const col of columns) {
    const raw = row[col.key];
    if (col.required && (raw === "" || raw === undefined)) {
      return { error: `"${col.header}" is required.` };
    }
    if (raw === "" || raw === undefined) {
      value[col.key] = undefined;
      continue;
    }
    if (col.type === "number") {
      const n = Number(raw);
      if (Number.isNaN(n)) return { error: `"${col.header}" must be a number (got "${raw}").` };
      value[col.key] = n;
    } else if (col.type === "date") {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return { error: `"${col.header}" must be a valid date (got "${raw}").` };
      value[col.key] = d.toISOString();
    } else if (col.type === "boolean") {
      value[col.key] = /^(true|1|yes)$/i.test(raw);
    } else {
      value[col.key] = raw;
    }
  }
  return { value };
}

export type ImportRowError = { row: number; message: string };

/**
 * POST /import/:module - per 05-API-Specification.md Section 13, "returns
 * job + error report if any". Rather than writing the error report to a
 * separate downloadable file (which would need a fourth endpoint not in the
 * spec), the row-level errors are returned directly in the response body
 * alongside the ImportJob record; `errorReportRef` stays null for now (the
 * column remains on the model for a future "download as file" enhancement).
 */
export async function runImport(
  organizationId: string,
  moduleKey: string,
  file: { buffer: Buffer; mimeType?: string; originalName: string },
  actorUserId: string
): Promise<{ job: Awaited<ReturnType<typeof prisma.importJob.create>>; errors: ImportRowError[] }> {
  const def = getImportModuleDef(moduleKey);
  const rawRows = await parseRows(def.columns, file.buffer, file.mimeType, file.originalName);

  if (rawRows.length === 0) {
    throw new AppError(400, "EMPTY_IMPORT_FILE", "No data rows were found in the uploaded file.");
  }
  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw new AppError(400, "IMPORT_TOO_LARGE", `A single import is limited to ${MAX_IMPORT_ROWS} rows. Split the file into smaller batches.`);
  }

  const job = await prisma.importJob.create({
    data: { organizationId, module: moduleKey, fileRef: file.originalName, status: "processing", totalRows: rawRows.length },
  });

  const errors: ImportRowError[] = [];
  let successCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 2; // header occupies row 1
    const { value, error } = coerceAndValidate(def.columns, rawRows[i]);
    if (error) {
      errors.push({ row: rowNumber, message: error });
      continue;
    }
    try {
      await def.createRow(organizationId, value!, actorUserId);
      successCount++;
    } catch (err) {
      // A single bad row must not abort the whole batch - collect the
      // message and continue, same principle as a spreadsheet-style
      // validation pass.
      errors.push({ row: rowNumber, message: err instanceof Error ? err.message : "Unknown error." });
    }
  }

  const status = errors.length === 0 ? "completed" : successCount === 0 ? "failed" : "completed_with_errors";
  const updated = await prisma.importJob.update({
    where: { id: job.id },
    data: { status, successRows: successCount, errorRows: errors.length },
  });

  eventBus.publish({
    type: "import.completed",
    organizationId,
    actorUserId,
    payload: { module: moduleKey, jobId: updated.id, successCount, errorCount: errors.length },
  });

  return { job: updated, errors };
}

export async function listImportJobs(organizationId: string, moduleKey?: string) {
  return prisma.importJob.findMany({
    where: { organizationId, ...(moduleKey ? { module: moduleKey } : {}) },
    orderBy: { createdAt: "desc" },
  });
}
