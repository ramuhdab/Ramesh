import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import { renderTable, ExportFormat } from "../../lib/tabularExport";
import { EXPORT_MODULES } from "./export.registry";

/** POST /export/:module - FR-34/WF34. Generates the file and records an ExportJob for history, then returns the rendered bytes to the route layer to send directly (no separate download step - the spec's single endpoint both "generates" and hands back the file). */
export async function runExport(organizationId: string, moduleKey: string, format: ExportFormat, requestedBy: string) {
  const def = EXPORT_MODULES[moduleKey];
  if (!def) throw new AppError(404, "UNKNOWN_EXPORT_MODULE", `"${moduleKey}" is not an exportable module.`);

  const rows = await def.fetchRows(organizationId);
  const rendered = await renderTable(format, def.label, def.columns, rows);

  await prisma.exportJob.create({
    data: { organizationId, module: moduleKey, format, requestedBy },
  });

  const fileName = `${moduleKey}-export-${new Date().toISOString().slice(0, 10)}.${rendered.fileExt}`;
  return { buffer: rendered.buffer, mimeType: rendered.mimeType, fileName };
}

export async function listExportJobs(organizationId: string, moduleKey?: string) {
  return prisma.exportJob.findMany({
    where: { organizationId, ...(moduleKey ? { module: moduleKey } : {}) },
    orderBy: { createdAt: "desc" },
  });
}
