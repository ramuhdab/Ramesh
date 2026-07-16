import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { AttachmentsPanel } from "../components/AttachmentsPanel";
import {
  badgeStyle,
  colors,
  errorBannerStyle,
  formRowStyle,
  h1Style,
  inputStyle,
  labelStyle,
  primaryButtonStyle,
  subheadStyle,
  successBannerStyle,
  tableStyle,
  tdStyle,
  thStyle,
} from "../theme";

type Ref = { id: string; name: string };
type Employee = {
  id: string;
  employeeCode: string;
  name: string;
  joiningDate: string;
  leavingDate: string | null;
  status: string;
  building: Ref | null;
  department: Ref | null;
  position: Ref | null;
  employeeCategory: Ref | null;
};

function statusBadgeKind(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "active" || status === "transferred") return "success";
  if (status === "leaving") return "warning";
  if (status === "exited") return "neutral";
  return "neutral";
}

// FR-7 / WF3 Employee Creation Workflow:
// HR -> Create Employee -> Assign Department -> Assign Building -> Assign
// Position -> Employee Active -> Eligible for Inventory.
// Business rules enforced server-side (employee.service.ts createEmployee):
// Employee ID (employeeCode) must be unique, Joining Date is mandatory,
// Building is mandatory, Position is mandatory. Department/Employee
// Category are optional groupings. A newly created employee is immediately
// "active" and therefore eligible for inventory issuance (see
// inventory.service.ts, which only allows issuance to active/transferred
// employees) - there is no separate manual "activate" step.
export function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [buildings, setBuildings] = useState<Ref[]>([]);
  const [departments, setDepartments] = useState<Ref[]>([]);
  const [positions, setPositions] = useState<Ref[]>([]);
  const [categories, setCategories] = useState<Ref[]>([]);

  const [employeeCode, setEmployeeCode] = useState("");
  const [name, setName] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [employeeCategoryId, setEmployeeCategoryId] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [employeeList, buildingList, departmentList, positionList, categoryList] = await Promise.all([
        api.get<Employee[]>("/employees"),
        api.get<Ref[]>("/config/buildings"),
        api.get<Ref[]>("/config/departments"),
        api.get<Ref[]>("/config/positions"),
        api.get<Ref[]>("/config/employee-categories"),
      ]);
      setEmployees(employeeList);
      setBuildings(buildingList);
      setDepartments(departmentList);
      setPositions(positionList);
      setCategories(categoryList);
      if (buildingList[0]) setBuildingId((v) => v || buildingList[0].id);
      if (positionList[0]) setPositionId((v) => v || positionList[0].id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await api.post("/employees", {
        employeeCode,
        name,
        joiningDate,
        buildingId,
        positionId,
        departmentId: departmentId || undefined,
        employeeCategoryId: employeeCategoryId || undefined,
      });
      setMessage(`Employee "${name}" created and active - eligible for inventory issuance.`);
      setEmployeeCode("");
      setName("");
      setJoiningDate("");
      setDepartmentId("");
      setEmployeeCategoryId("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create employee.");
    } finally {
      setSubmitting(false);
    }
  }

  const missingPrereqs = !loading && (buildings.length === 0 || positions.length === 0);

  return (
    <div>
      <h1 style={h1Style}>Employees</h1>
      <p style={subheadStyle}>
        Create, Department &rarr; Building &rarr; Position &rarr; Active &rarr; eligible for inventory.
      </p>

      {missingPrereqs && (
        <div style={errorBannerStyle}>
          {buildings.length === 0 && "No buildings configured yet. "}
          {positions.length === 0 && "No positions configured yet. "}
          Building and Position are mandatory for every employee - add them on the{" "}
          <Link to="/master-data" style={{ color: "#b91c1c", fontWeight: 600 }}>Master Data</Link> screen first.
        </div>
      )}

      <form onSubmit={handleCreate} style={formRowStyle}>
        <label>
          <span style={labelStyle}>Employee ID</span>
          <input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} required style={{ ...inputStyle, width: 140 }} placeholder="e.g. EMP-0042" />
        </label>
        <label>
          <span style={labelStyle}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ ...inputStyle, width: 200 }} />
        </label>
        <label>
          <span style={labelStyle}>Joining Date</span>
          <input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} required style={{ ...inputStyle, width: 160 }} />
        </label>
        <label>
          <span style={labelStyle}>Building *</span>
          <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)} required style={{ ...inputStyle, width: 170 }} disabled={buildings.length === 0}>
            <option value="" disabled>Select building</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>Position *</span>
          <select value={positionId} onChange={(e) => setPositionId(e.target.value)} required style={{ ...inputStyle, width: 170 }} disabled={positions.length === 0}>
            <option value="" disabled>Select position</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>Department</span>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={{ ...inputStyle, width: 170 }}>
            <option value="">None</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>Category</span>
          <select value={employeeCategoryId} onChange={(e) => setEmployeeCategoryId(e.target.value)} style={{ ...inputStyle, width: 170 }}>
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" style={{ ...primaryButtonStyle, opacity: submitting || buildings.length === 0 || positions.length === 0 ? 0.6 : 1 }} disabled={submitting || buildings.length === 0 || positions.length === 0}>
          {submitting ? "Creating..." : "Create employee"}
        </button>
      </form>

      {error && <div style={errorBannerStyle}>{error}</div>}
      {message && <div style={successBannerStyle}>{message}</div>}

      {loading ? (
        <p style={subheadStyle}>Loading...</p>
      ) : employees.length === 0 ? (
        <p style={subheadStyle}>No employees yet - create the first one above.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Employee ID</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Building</th>
              <th style={thStyle}>Position</th>
              <th style={thStyle}>Department</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Joined</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Inventory Eligible</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <Fragment key={emp.id}>
                <tr>
                  <td style={tdStyle}>{emp.employeeCode}</td>
                  <td style={tdStyle}>{emp.name}</td>
                  <td style={tdStyle}>{emp.building?.name ?? "-"}</td>
                  <td style={tdStyle}>{emp.position?.name ?? "-"}</td>
                  <td style={tdStyle}>{emp.department?.name ?? "-"}</td>
                  <td style={tdStyle}>{emp.employeeCategory?.name ?? "-"}</td>
                  <td style={tdStyle}>{new Date(emp.joiningDate).toLocaleDateString()}</td>
                  <td style={tdStyle}>
                    <span style={badgeStyle(statusBadgeKind(emp.status))}>{emp.status}</span>
                  </td>
                  <td style={tdStyle}>
                    {emp.status === "active" || emp.status === "transferred" ? (
                      <span style={{ color: colors.success, fontWeight: 600, fontSize: "0.85rem" }}>Yes</span>
                    ) : (
                      <span style={{ color: colors.textFaint, fontSize: "0.85rem" }}>No</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <button onClick={() => setExpandedId(expandedId === emp.id ? null : emp.id)} style={{ background: "none", border: "none", color: colors.accent, cursor: "pointer", fontSize: "0.8rem", padding: 0 }}>
                      {expandedId === emp.id ? "Hide files" : "Attachments"}
                    </button>
                  </td>
                </tr>
                {expandedId === emp.id && (
                  <tr>
                    <td colSpan={9} style={{ ...tdStyle, background: colors.surfaceMuted }}>
                      <AttachmentsPanel entityType="employee" entityId={emp.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
