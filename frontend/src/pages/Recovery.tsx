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

type EmployeeRef = { id: string; employeeCode: string; name: string; status: string };
type ItemRef = { id: string; itemCode: string; name: string };
type Issuance = { id: string; quantity: number; issuedAt: string; employee: { id: string }; inventoryItem: { id: string; itemCode: string; name: string } };

type Incident = {
  id: string;
  type: "lost" | "damaged";
  reportedAt: string;
  managerVerifiedBy: string | null;
  recoveryAmount: number | null;
  employee: { id: string; employeeCode: string; name: string };
  inventoryItem: { id: string; itemCode: string; name: string };
  itemIssuanceId: string | null;
};

type RecoveryCalc = {
  id: string;
  sourceType: "exit" | "loss" | "damage";
  calculatedAmount: number;
  financeVerifiedBy: string | null;
  financeVerifiedAt: string | null;
  salaryDeductionRef: string | null;
  employee: { id: string; employeeCode: string; name: string };
  itemIssuance: { id: string; inventoryItem: { itemCode: string; name: string } } | null;
};

const TABS = [
  { key: "report", label: "Report Incident" },
  { key: "incidents", label: "Incidents" },
  { key: "calculations", label: "Recovery Calculations" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

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

/**
 * Loss/Damage & Recovery module - WF12 (Lost Item), WF13 (Damaged Item),
 * WF26 (Recovery Calculation: join date, leave/incident date, and the
 * item's policy determine a straight-line-depreciated recovery amount,
 * per BRD FR-30). This is the module the whole "cost recovery when an
 * employee leaves early" requirement depends on.
 */
export function Recovery() {
  const [tab, setTab] = useState<TabKey>("report");
  const [employees, setEmployees] = useState<EmployeeRef[]>([]);
  const [items, setItems] = useState<ItemRef[]>([]);
  const [issuances, setIssuances] = useState<Issuance[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [calcs, setCalcs] = useState<RecoveryCalc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [employeeList, itemList, issuanceList, incidentList, calcList] = await Promise.all([
        api.get<EmployeeRef[]>("/employees"),
        api.get<ItemRef[]>("/inventory/items"),
        api.get<Issuance[]>("/inventory/issuances"),
        api.get<Incident[]>("/inventory/incidents"),
        api.get<RecoveryCalc[]>("/recovery"),
      ]);
      setEmployees(employeeList);
      setItems(itemList);
      setIssuances(issuanceList);
      setIncidents(incidentList);
      setCalcs(calcList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load recovery data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function switchTab(key: TabKey) {
    setTab(key);
    setError(null);
    setMessage(null);
  }

  return (
    <div>
      <h1 style={h1Style}>Loss, Damage &amp; Recovery</h1>
      <p style={subheadStyle}>Report lost or damaged items, verify incidents, and calculate cost recovery.</p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => switchTab(t.key)} style={tabButtonStyle(t.key === tab)}>{t.label}</button>
        ))}
      </div>

      {error && <div style={errorBannerStyle}>{error}</div>}
      {message && <div style={successBannerStyle}>{message}</div>}

      {loading ? (
        <p style={subheadStyle}>Loading...</p>
      ) : (
        <>
          {tab === "report" && (
            <ReportTab employees={employees} items={items} issuances={issuances} onChanged={loadAll} setError={setError} setMessage={setMessage} />
          )}
          {tab === "incidents" && <IncidentsTab incidents={incidents} onChanged={loadAll} setError={setError} setMessage={setMessage} />}
          {tab === "calculations" && (
            <CalculationsTab calcs={calcs} employees={employees} issuances={issuances} onChanged={loadAll} setError={setError} setMessage={setMessage} />
          )}
        </>
      )}
    </div>
  );
}

type TabProps = {
  onChanged: () => Promise<void>;
  setError: (msg: string | null) => void;
  setMessage: (msg: string | null) => void;
};

function ReportTab({ employees, items, issuances, onChanged, setError, setMessage }: TabProps & { employees: EmployeeRef[]; items: ItemRef[]; issuances: Issuance[] }) {
  const [type, setType] = useState<"lost" | "damaged">("lost");
  const [employeeId, setEmployeeId] = useState("");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [itemIssuanceId, setItemIssuanceId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const employeeIssuances = issuances.filter((i) => i.employee.id === employeeId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await api.post(`/inventory/${type}`, { employeeId, inventoryItemId, itemIssuanceId: itemIssuanceId || undefined });
      setMessage(`${type === "lost" ? "Lost" : "Damaged"} item reported - awaiting manager verification.`);
      setEmployeeId("");
      setInventoryItemId("");
      setItemIssuanceId("");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to report incident.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p style={subheadStyle}>Linking the specific issuance is optional, but required later to calculate a recovery amount for this incident.</p>
      <div style={formRowStyle}>
        <label>
          <span style={labelStyle}>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as "lost" | "damaged")} style={{ ...inputStyle, width: 140 }}>
            <option value="lost">Lost</option>
            <option value="damaged">Damaged</option>
          </select>
        </label>
        <label>
          <span style={labelStyle}>Employee</span>
          <select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setItemIssuanceId(""); }} required style={{ ...inputStyle, width: 200 }}>
            <option value="" disabled>Select employee</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.employeeCode} - {e.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>Item</span>
          <select value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)} required style={{ ...inputStyle, width: 200 }}>
            <option value="" disabled>Select item</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>{it.itemCode} - {it.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>Issuance (optional)</span>
          <select value={itemIssuanceId} onChange={(e) => setItemIssuanceId(e.target.value)} style={{ ...inputStyle, width: 220 }} disabled={!employeeId}>
            <option value="">None</option>
            {employeeIssuances.map((i) => (
              <option key={i.id} value={i.id}>{i.inventoryItem.itemCode} - {i.inventoryItem.name} (issued {new Date(i.issuedAt).toLocaleDateString()})</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Reporting..." : "Report incident"}
        </button>
      </div>
    </form>
  );
}

function IncidentsTab({ incidents, onChanged, setError, setMessage }: TabProps & { incidents: Incident[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function verify(incident: Incident) {
    setError(null);
    setMessage(null);
    setBusyId(incident.id);
    try {
      await api.post(`/inventory/incidents/${incident.id}/verify`);
      setMessage("Incident verified - recovery can now be calculated.");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to verify incident.");
    } finally {
      setBusyId(null);
    }
  }

  async function calculate(incident: Incident) {
    if (!incident.itemIssuanceId) {
      setError("This report has no linked issuance, so recovery cannot be calculated for it - report a new incident and select the issuance.");
      return;
    }
    setError(null);
    setMessage(null);
    setBusyId(incident.id);
    try {
      await api.post("/recovery/calculate", {
        employeeId: incident.employee.id,
        sourceType: incident.type === "lost" ? "loss" : "damage",
        itemIssuanceId: incident.itemIssuanceId,
        lostDamagedReportId: incident.id,
      });
      setMessage("Recovery amount calculated - see the Recovery Calculations tab to Finance-verify it.");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to calculate recovery.");
    } finally {
      setBusyId(null);
    }
  }

  if (incidents.length === 0) return <p style={subheadStyle}>No incidents reported yet.</p>;

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>Employee</th>
          <th style={thStyle}>Item</th>
          <th style={thStyle}>Type</th>
          <th style={thStyle}>Reported</th>
          <th style={thStyle}>Verified</th>
          <th style={thStyle}></th>
        </tr>
      </thead>
      <tbody>
        {incidents.map((i) => (
          <tr key={i.id}>
            <td style={tdStyle}>{i.employee.employeeCode} - {i.employee.name}</td>
            <td style={tdStyle}>{i.inventoryItem.itemCode} - {i.inventoryItem.name}</td>
            <td style={tdStyle}>
              <span style={badgeStyle(i.type === "lost" ? "danger" : "warning")}>{i.type}</span>
            </td>
            <td style={tdStyle}>{new Date(i.reportedAt).toLocaleDateString()}</td>
            <td style={tdStyle}>
              {i.managerVerifiedBy ? <span style={badgeStyle("success")}>Verified</span> : <span style={badgeStyle("neutral")}>Pending</span>}
            </td>
            <td style={tdStyle}>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                {!i.managerVerifiedBy && (
                  <button onClick={() => verify(i)} disabled={busyId === i.id} style={secondaryButtonStyle}>Verify</button>
                )}
                {i.managerVerifiedBy && (
                  <button onClick={() => calculate(i)} disabled={busyId === i.id} style={secondaryButtonStyle}>Calculate Recovery</button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CalculationsTab({ calcs, employees, issuances, onChanged, setError, setMessage }: TabProps & { calcs: RecoveryCalc[]; employees: EmployeeRef[]; issuances: Issuance[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exitEmployeeId, setExitEmployeeId] = useState("");
  const [exitIssuanceId, setExitIssuanceId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const exitIssuances = issuances.filter((i) => i.employee.id === exitEmployeeId);

  async function calculateExit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await api.post("/recovery/calculate", { employeeId: exitEmployeeId, sourceType: "exit", itemIssuanceId: exitIssuanceId });
      setMessage("Exit recovery calculated.");
      setExitEmployeeId("");
      setExitIssuanceId("");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to calculate exit recovery.");
    } finally {
      setSubmitting(false);
    }
  }

  async function financeVerify(calc: RecoveryCalc) {
    const ref = window.prompt("Salary deduction reference (optional):") ?? undefined;
    setError(null);
    setMessage(null);
    setBusyId(calc.id);
    try {
      await api.post(`/recovery/${calc.id}/finance-verify`, { salaryDeductionRef: ref || undefined });
      setMessage("Finance-verified.");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to Finance-verify.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <p style={subheadStyle}>Calculate a recovery amount directly for an employee exit (join date to leave date, depreciated against the item's policy).</p>
      <form onSubmit={calculateExit} style={formRowStyle}>
        <label>
          <span style={labelStyle}>Employee</span>
          <select value={exitEmployeeId} onChange={(e) => { setExitEmployeeId(e.target.value); setExitIssuanceId(""); }} required style={{ ...inputStyle, width: 220 }}>
            <option value="" disabled>Select employee</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.employeeCode} - {e.name} ({e.status})</option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>Issuance</span>
          <select value={exitIssuanceId} onChange={(e) => setExitIssuanceId(e.target.value)} required style={{ ...inputStyle, width: 240 }} disabled={!exitEmployeeId}>
            <option value="" disabled>Select issuance</option>
            {exitIssuances.map((i) => (
              <option key={i.id} value={i.id}>{i.inventoryItem.itemCode} - {i.inventoryItem.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Calculating..." : "Calculate exit recovery"}
        </button>
      </form>

      {calcs.length === 0 ? (
        <p style={subheadStyle}>No recovery calculations yet.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Employee</th>
              <th style={thStyle}>Item</th>
              <th style={thStyle}>Source</th>
              <th style={thStyle}>Amount</th>
              <th style={thStyle}>Finance</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {calcs.map((c) => (
              <tr key={c.id}>
                <td style={tdStyle}>{c.employee.employeeCode} - {c.employee.name}</td>
                <td style={tdStyle}>{c.itemIssuance ? `${c.itemIssuance.inventoryItem.itemCode} - ${c.itemIssuance.inventoryItem.name}` : "-"}</td>
                <td style={tdStyle}>{c.sourceType}</td>
                <td style={tdStyle}>₹{Number(c.calculatedAmount).toFixed(2)}</td>
                <td style={tdStyle}>
                  {c.financeVerifiedAt ? <span style={badgeStyle("success")}>Verified</span> : <span style={badgeStyle("neutral")}>Pending</span>}
                </td>
                <td style={tdStyle}>
                  {!c.financeVerifiedAt && (
                    <button onClick={() => financeVerify(c)} disabled={busyId === c.id} style={secondaryButtonStyle}>Finance Verify</button>
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
