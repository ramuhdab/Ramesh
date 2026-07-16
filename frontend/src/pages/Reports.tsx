import { useEffect, useState } from "react";
import { api, ApiError, fetchBlob } from "../api/client";
import {
  colors,
  errorBannerStyle,
  formRowStyle,
  h1Style,
  inputStyle,
  labelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  subheadStyle,
  tableStyle,
  tdStyle,
  thStyle,
} from "../theme";

type ReportKeyDef = { key: string; label: string };
type Column = { key: string; header: string };
type Ref = { id: string; name?: string; employeeCode?: string };

// Extra filter controls per report, beyond the generic fromDate/toDate every
// report accepts (report.registry.ts). Kept as a small declarative table
// instead of a switch statement per report, matching the backend's own
// registry-driven design.
const REPORT_EXTRA_FILTERS: Record<string, "category" | "employee" | "status" | "verifiedOnly" | null> = {
  "inventory-stock": "category",
  "employee-issuance": "employee",
  "procurement-status": "status",
  "vendor-performance": null,
  "recovery-deductions": "verifiedOnly",
};

const STATUS_OPTIONS = ["pending", "approved", "rejected", "cancelled"];

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: "0.5rem 1rem",
  borderRadius: 8,
  border: `1px solid ${active ? colors.brandDarker : colors.border}`,
  background: active ? colors.brandDarker : colors.surface,
  color: active ? "white" : colors.textSecondary,
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

function formatCell(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString();
  return String(value);
}

// Reporting module (FR-28/WF24) - curated cross-module reports (as opposed
// to the raw per-table Data Import/Export dumps). Every report shares the
// same fromDate/toDate filters plus one report-specific filter, and can be
// previewed on screen or exported to PDF/Excel/CSV.
export function Reports() {
  const [reportKeys, setReportKeys] = useState<ReportKeyDef[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [categories, setCategories] = useState<Ref[]>([]);
  const [employees, setEmployees] = useState<Ref[]>([]);

  const [columns, setColumns] = useState<Column[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [keys, categoryList, employeeList] = await Promise.all([
          api.get<ReportKeyDef[]>("/reports"),
          api.get<Ref[]>("/config/inventory-categories"),
          api.get<Ref[]>("/employees"),
        ]);
        setReportKeys(keys);
        setCategories(categoryList);
        setEmployees(employeeList);
        if (keys[0]) setActiveKey(keys[0].key);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load reports.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function buildQuery(): string {
    const params = new URLSearchParams();
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    const extra = activeKey ? REPORT_EXTRA_FILTERS[activeKey] : null;
    if (extra === "category" && categoryId) params.set("categoryId", categoryId);
    if (extra === "employee" && employeeId) params.set("employeeId", employeeId);
    if (extra === "status" && status) params.set("status", status);
    if (extra === "verifiedOnly" && verifiedOnly) params.set("verifiedOnly", "true");
    return params.toString();
  }

  async function runReport() {
    if (!activeKey) return;
    setRunning(true);
    setError(null);
    try {
      const query = buildQuery();
      const { data, meta } = await api.getWithMeta<Record<string, unknown>[]>(`/reports/${activeKey}${query ? `?${query}` : ""}`);
      setRows(data);
      setColumns((meta?.columns as Column[]) ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to run report.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    if (activeKey) runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  async function handleExport(format: "pdf" | "xlsx" | "csv") {
    if (!activeKey) return;
    setExporting(format);
    setError(null);
    try {
      const query = buildQuery();
      const { blob, disposition } = await fetchBlob(`/reports/${activeKey}/export?format=${format}${query ? `&${query}` : ""}`);
      const fileName = disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? `${activeKey}.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to export report.");
    } finally {
      setExporting(null);
    }
  }

  const extraFilter = activeKey ? REPORT_EXTRA_FILTERS[activeKey] : null;

  return (
    <div>
      <h1 style={h1Style}>Reports</h1>
      <p style={subheadStyle}>Curated, filterable reports across employees, inventory, procurement, vendors, and recovery - previewable here or exportable to PDF/Excel/CSV.</p>

      {loading ? (
        <p style={subheadStyle}>Loading...</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
            {reportKeys.map((r) => (
              <button key={r.key} onClick={() => setActiveKey(r.key)} style={tabButtonStyle(r.key === activeKey)}>{r.label}</button>
            ))}
          </div>

          <div style={{ ...formRowStyle, marginBottom: "1rem" }}>
            <label>
              <span style={labelStyle}>From date</span>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ ...inputStyle, width: 150 }} />
            </label>
            <label>
              <span style={labelStyle}>To date</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ ...inputStyle, width: 150 }} />
            </label>
            {extraFilter === "category" && (
              <label>
                <span style={labelStyle}>Category</span>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ ...inputStyle, width: 180 }}>
                  <option value="">All</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            )}
            {extraFilter === "employee" && (
              <label>
                <span style={labelStyle}>Employee</span>
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={{ ...inputStyle, width: 200 }}>
                  <option value="">All</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.employeeCode} - {e.name}</option>
                  ))}
                </select>
              </label>
            )}
            {extraFilter === "status" && (
              <label>
                <span style={labelStyle}>Status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inputStyle, width: 160 }}>
                  <option value="">All</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}
            {extraFilter === "verifiedOnly" && (
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", paddingBottom: "0.4rem" }}>
                <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
                <span style={{ fontSize: "0.85rem", color: colors.textSecondary }}>Finance-verified only</span>
              </label>
            )}
            <button onClick={runReport} disabled={running} style={{ ...primaryButtonStyle, opacity: running ? 0.6 : 1 }}>
              {running ? "Running..." : "Run report"}
            </button>
            <button onClick={() => handleExport("pdf")} disabled={exporting !== null} style={secondaryButtonStyle}>
              {exporting === "pdf" ? "..." : "Export PDF"}
            </button>
            <button onClick={() => handleExport("xlsx")} disabled={exporting !== null} style={secondaryButtonStyle}>
              {exporting === "xlsx" ? "..." : "Export Excel"}
            </button>
            <button onClick={() => handleExport("csv")} disabled={exporting !== null} style={secondaryButtonStyle}>
              {exporting === "csv" ? "..." : "Export CSV"}
            </button>
          </div>

          {error && <div style={errorBannerStyle}>{error}</div>}

          {running ? (
            <p style={subheadStyle}>Running report...</p>
          ) : rows.length === 0 ? (
            <p style={subheadStyle}>No rows for this report/filter combination.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} style={thStyle}>{c.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    {columns.map((c) => (
                      <td key={c.key} style={tdStyle}>{formatCell(row[c.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
