import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { toCsv } from "./csv.util";

export type ExportFormat = "xlsx" | "csv" | "pdf";

export type TabularColumn = { key: string; header: string };

export type RenderedFile = { buffer: Buffer; mimeType: string; fileExt: string };

const MIME_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

/**
 * Renders tabular data (columns + rows of plain objects) to one of the three
 * formats FR-28/FR-34 require (PDF/Excel for reports, xlsx/csv/pdf for
 * import/export). Shared by the Reporting module (report.service.ts) and the
 * Data Import/Export module (export.service.ts) so the rendering logic
 * exists exactly once.
 */
export async function renderTable(
  format: ExportFormat,
  title: string,
  columns: TabularColumn[],
  rows: Record<string, unknown>[]
): Promise<RenderedFile> {
  const cellStrings = rows.map((r) => columns.map((c) => formatCell(r[c.key])));

  if (format === "csv") {
    const text = toCsv([columns.map((c) => c.header), ...cellStrings]);
    return { buffer: Buffer.from(text, "utf-8"), mimeType: MIME_TYPES.csv, fileExt: "csv" };
  }

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(title.slice(0, 31) || "Sheet1"); // Excel sheet-name length limit
    sheet.addRow(columns.map((c) => c.header));
    sheet.getRow(1).font = { bold: true };
    for (const row of cellStrings) sheet.addRow(row);
    sheet.columns.forEach((col) => (col.width = 20));
    // writeBuffer() resolves to a Node Buffer at runtime; Buffer.from(...) here
    // is a defensive copy that works whether the underlying type is a Buffer
    // or a plain ArrayBuffer (ExcelJS's typings have varied across versions).
    const written = await workbook.xlsx.writeBuffer();
    return { buffer: Buffer.from(written as any), mimeType: MIME_TYPES.xlsx, fileExt: "xlsx" };
  }

  const buffer = await renderPdfTable(title, columns.map((c) => c.header), cellStrings);
  return { buffer, mimeType: MIME_TYPES.pdf, fileExt: "pdf" };
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function renderPdfTable(title: string, headers: string[], rows: string[][]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(14).font("Helvetica-Bold").text(title, { align: "center" });
    doc.moveDown();

    const left = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = usableWidth / Math.max(headers.length, 1);
    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    function drawRow(cells: string[], bold: boolean) {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8);
      const y = doc.y;
      cells.forEach((cell, i) => doc.text(cell, left + i * colWidth, y, { width: colWidth - 4, ellipsis: true }));
      doc.moveDown(0.6);
    }

    drawRow(headers, true);
    for (const row of rows) {
      if (doc.y > bottomLimit - 20) {
        doc.addPage();
      }
      drawRow(row, false);
    }

    if (rows.length === 0) {
      doc.font("Helvetica-Oblique").fontSize(9).text("No data matched the selected filters.");
    }

    doc.end();
  });
}
