import { AppError } from "../../middleware/errorHandler";
import { renderTable, ExportFormat } from "../../lib/tabularExport";
import { REPORT_DEFS, ReportFilters } from "./report.registry";

function getReportDef(reportKey: string) {
  const def = REPORT_DEFS[reportKey];
  if (!def) throw new AppError(404, "UNKNOWN_REPORT", `"${reportKey}" is not a known report.`);
  return def;
}

/** GET /reports/:reportKey - filtered report data as JSON, for an on-screen preview/table. */
export async function previewReport(organizationId: string, reportKey: string, filters: ReportFilters) {
  const def = getReportDef(reportKey);
  const rows = await def.fetchRows(organizationId, filters);
  return { reportKey, label: def.label, columns: def.columns, rows };
}

/** GET /reports/:reportKey/export - same data, rendered to PDF/Excel/CSV. */
export async function exportReport(organizationId: string, reportKey: string, format: ExportFormat, filters: ReportFilters) {
  const def = getReportDef(reportKey);
  const rows = await def.fetchRows(organizationId, filters);
  const rendered = await renderTable(format, def.label, def.columns, rows);
  const fileName = `${reportKey}-${new Date().toISOString().slice(0, 10)}.${rendered.fileExt}`;
  return { ...rendered, fileName };
}

export function listReportKeys() {
  return Object.values(REPORT_DEFS).map((d) => ({ key: d.key, label: d.label }));
}
