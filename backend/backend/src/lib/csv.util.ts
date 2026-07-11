/**
 * Minimal, dependency-free CSV reader/writer (RFC 4180-ish: comma-delimited,
 * double-quote escaping, CRLF or LF line endings). Written by hand instead of
 * pulling in a CSV library because the format is small enough to get right
 * and reviewed directly - XLSX parsing/writing (a much larger format) still
 * uses ExcelJS. Used by the Data Import/Export module and Reporting exports.
 */

/** Parses CSV text into a 2D array of strings (first row is assumed to be the header by callers). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Normalize line endings up front so the state machine below only has to
  // reason about "\n" as a row separator.
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === "") {
      // RFC 4180: a quote only starts a quoted field when it's the first
      // character of that field. A stray quote appearing mid-field (e.g.
      // `ab"cd`) is treated as a literal character instead of entering
      // quote-mode, which would otherwise swallow the rest of the row
      // looking for a closing quote (flagged in code review).
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  // Flush the last field/row if the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop trailing fully-blank rows (common with a trailing newline).
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Serializes a 2D array of cells into CSV text, quoting fields that need it. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell === null || cell === undefined ? "" : String(cell);
          // Also quote on a bare "\r" - rows are joined with "\r\n" below, so
          // an unquoted "\r" inside a value would be indistinguishable from
          // (half of) a row separator on re-import (flagged in code review).
          if (/[",\n\r]/.test(s)) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(",")
    )
    .join("\r\n");
}
