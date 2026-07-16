import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import {
  badgeStyle,
  colors,
  errorBannerStyle,
  formRowStyle,
  h1Style,
  inputStyle,
  labelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  subheadStyle,
  successBannerStyle,
  tableStyle,
  tdStyle,
  thStyle,
} from "../theme";

type Row = { id: string; name: string; code?: string | null; isActive: boolean };

type EntityDef = {
  key: string;
  label: string;
  endpoint: string;
  hasCode: boolean;
  helper: string;
};

// WF35 System Configuration & Master Data Management Workflow. Buildings and
// Positions are mandatory prerequisites for Employee Creation (see
// Employees.tsx / employee.service.ts createEmployee) - this screen is
// where an Org Admin sets those up before anyone can add an employee.
const ENTITIES: EntityDef[] = [
  { key: "buildings", label: "Buildings", endpoint: "/config/buildings", hasCode: true, helper: "Required before creating employees - every employee must be assigned to a building." },
  { key: "departments", label: "Departments", endpoint: "/config/departments", hasCode: true, helper: "Optional grouping for employees and indents." },
  { key: "positions", label: "Positions", endpoint: "/config/positions", hasCode: false, helper: "Required before creating employees - every employee must be assigned a position." },
  { key: "employee-categories", label: "Employee Categories", endpoint: "/config/employee-categories", hasCode: false, helper: "e.g. Mechanical, Electrical, Plumber, HVAC Technician, Housekeeper, Pantry Staff." },
];

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: "0.5rem 1rem",
  borderRadius: 8,
  border: `1px solid ${active ? colors.brandDarker : colors.border}`,
  background: active ? colors.brandDarker : colors.surface,
  color: active ? "white" : colors.textSecondary,
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
});

// WF35: manage the master data (Buildings, Departments, Positions, Employee
// Categories) that every other module - starting with Employee Creation -
// depends on. One generic table+form per entity, since the backend already
// exposes them through one generic CRUD factory (masterData.factory.ts).
export function MasterData() {
  const [activeKey, setActiveKey] = useState(ENTITIES[0].key);
  const active = ENTITIES.find((e) => e.key === activeKey)!;

  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.get<Row[]>(active.endpoint));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to load ${active.label.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setName("");
    setCode("");
    setMessage(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api.post(active.endpoint, active.hasCode ? { name, code } : { name });
      setMessage(`"${name}" added.`);
      setName("");
      setCode("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to create ${active.label.toLowerCase().slice(0, -1)}.`);
    }
  }

  async function handleDeactivate(row: Row) {
    setError(null);
    try {
      await api.delete(`${active.endpoint}/${row.id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to deactivate.");
    }
  }

  return (
    <div>
      <h1 style={h1Style}>Master Data</h1>
      <p style={subheadStyle}>Buildings, departments, positions, and employee categories used across the app.</p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {ENTITIES.map((e) => (
          <button key={e.key} onClick={() => setActiveKey(e.key)} style={tabButtonStyle(e.key === activeKey)}>
            {e.label}
          </button>
        ))}
      </div>

      <p style={{ ...subheadStyle, marginBottom: "1rem" }}>{active.helper}</p>

      <form onSubmit={handleCreate} style={formRowStyle}>
        <label>
          <span style={labelStyle}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ ...inputStyle, width: 220 }} />
        </label>
        {active.hasCode && (
          <label>
            <span style={labelStyle}>Code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} required style={{ ...inputStyle, width: 140 }} />
          </label>
        )}
        <button type="submit" style={primaryButtonStyle}>Add {active.label.slice(0, -1)}</button>
      </form>

      {error && <div style={errorBannerStyle}>{error}</div>}
      {message && <div style={successBannerStyle}>{message}</div>}

      {loading ? (
        <p style={subheadStyle}>Loading...</p>
      ) : rows.length === 0 ? (
        <p style={subheadStyle}>No {active.label.toLowerCase()} yet - add one above.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              {active.hasCode && <th style={thStyle}>Code</th>}
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={tdStyle}>{r.name}</td>
                {active.hasCode && <td style={tdStyle}>{r.code}</td>}
                <td style={tdStyle}>
                  <span style={badgeStyle(r.isActive ? "success" : "neutral")}>{r.isActive ? "Active" : "Inactive"}</span>
                </td>
                <td style={tdStyle}>
                  {r.isActive && (
                    <button onClick={() => handleDeactivate(r)} style={secondaryButtonStyle}>
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
