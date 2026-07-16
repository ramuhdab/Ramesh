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

// Default 4-level approval chain (approval.service.ts DEFAULT_LEVELS) -
// used here only to LABEL which role a pending request is waiting on; the
// backend is the actual source of truth/enforcement (a custom
// ApprovalWorkflow master-data record can override this order per org).
const DEFAULT_LEVELS = ["Tech Manager", "Senior Manager", "Finance", "Managing Director"];

type InventoryItemRef = { id: string; itemCode: string; name: string; currentStockQty: number };
type DepartmentRef = { id: string; name: string };

type ProcurementRequest = {
  id: string;
  sourceType: "low_stock" | "critical_stock" | "indent";
  inventoryItemId: string | null;
  inventoryItem: { id: string; itemCode: string; name: string } | null;
  quantity: number;
  status: string;
  currentApprovalLevel: number;
  cancelledReason: string | null;
  createdAt: string;
};

type IndentItemRow = { inventoryItemId: string; itemName: string; quantity: number };
type Indent = {
  id: string;
  departmentId: string | null;
  department: DepartmentRef | null;
  items: IndentItemRow[];
  status: string;
  currentApprovalLevel: number;
  createdAt: string;
};

function statusBadgeKind(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "approved") return "success";
  if (status === "pending") return "warning";
  if (status === "rejected" || status === "cancelled") return "danger";
  return "neutral";
}

function levelLabel(status: string, level: number): string {
  if (status !== "pending") return "-";
  return DEFAULT_LEVELS[level] ?? "Final approver";
}

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

// Procurement & Approvals module - WF7 Purchase (direct procurement request
// against a stock item) and WF17 Indent (department-raised multi-item
// request). Both flow through the same 4-level approval chain: Tech Manager
// -> Senior Manager -> Finance -> Managing Director (WF7/WF17), and WF20
// lets the raiser cancel a still-pending request with a mandatory reason.
export function Procurement() {
  const [tab, setTab] = useState<"requests" | "indents">("requests");
  const [requests, setRequests] = useState<ProcurementRequest[]>([]);
  const [indents, setIndents] = useState<Indent[]>([]);
  const [items, setItems] = useState<InventoryItemRef[]>([]);
  const [departments, setDepartments] = useState<DepartmentRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [requestList, indentList, itemList, departmentList] = await Promise.all([
        api.get<ProcurementRequest[]>("/procurement/requests"),
        api.get<Indent[]>("/indents"),
        api.get<InventoryItemRef[]>("/inventory/items"),
        api.get<DepartmentRef[]>("/config/departments"),
      ]);
      setRequests(requestList);
      setIndents(indentList);
      setItems(itemList);
      setDepartments(departmentList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load procurement data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function switchTab(t: "requests" | "indents") {
    setTab(t);
    setError(null);
    setMessage(null);
  }

  return (
    <div>
      <h1 style={h1Style}>Procurement &amp; Approvals</h1>
      <p style={subheadStyle}>Purchase requests and department indents, both routed through the 4-level approval chain.</p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <button onClick={() => switchTab("requests")} style={tabButtonStyle(tab === "requests")}>Procurement Requests</button>
        <button onClick={() => switchTab("indents")} style={tabButtonStyle(tab === "indents")}>Indents</button>
      </div>

      {error && <div style={errorBannerStyle}>{error}</div>}
      {message && <div style={successBannerStyle}>{message}</div>}

      {loading ? (
        <p style={subheadStyle}>Loading...</p>
      ) : tab === "requests" ? (
        <RequestsTab requests={requests} items={items} onChanged={loadAll} setError={setError} setMessage={setMessage} />
      ) : (
        <IndentsTab indents={indents} items={items} departments={departments} onChanged={loadAll} setError={setError} setMessage={setMessage} />
      )}
    </div>
  );
}

type TabProps = {
  onChanged: () => Promise<void>;
  setError: (msg: string | null) => void;
  setMessage: (msg: string | null) => void;
};

function RequestsTab({ requests, items, onChanged, setError, setMessage }: TabProps & { requests: ProcurementRequest[]; items: InventoryItemRef[] }) {
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await api.post("/procurement/requests", { sourceType: "indent", inventoryItemId: inventoryItemId || undefined, quantity: Number(quantity) });
      setMessage("Procurement request created - awaiting Tech Manager approval.");
      setQuantity("1");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create procurement request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(req: ProcurementRequest, decision: "approved" | "rejected") {
    setError(null);
    setMessage(null);
    setBusyId(req.id);
    try {
      await api.post(`/procurement/requests/${req.id}/approve`, { decision });
      setMessage(decision === "approved" ? "Approved - moved to next level." : "Rejected.");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record decision.");
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(req: ProcurementRequest) {
    const reason = window.prompt("Reason for cancelling this request?");
    if (!reason) return;
    setError(null);
    setMessage(null);
    setBusyId(req.id);
    try {
      await api.post(`/procurement/requests/${req.id}/cancel`, { reason });
      setMessage("Request cancelled.");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel request.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <form onSubmit={handleCreate} style={formRowStyle}>
        <label>
          <span style={labelStyle}>Item</span>
          <select value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)} required style={{ ...inputStyle, width: 240 }}>
            <option value="" disabled>Select item</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>{it.itemCode} - {it.name} ({it.currentStockQty} in stock)</option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>Quantity</span>
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required style={{ ...inputStyle, width: 120 }} />
        </label>
        <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Submitting..." : "Create request"}
        </button>
      </form>

      {requests.length === 0 ? (
        <p style={subheadStyle}>No procurement requests yet.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Item</th>
              <th style={thStyle}>Quantity</th>
              <th style={thStyle}>Source</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Awaiting</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td style={tdStyle}>{r.inventoryItem ? `${r.inventoryItem.itemCode} - ${r.inventoryItem.name}` : "-"}</td>
                <td style={tdStyle}>{r.quantity}</td>
                <td style={tdStyle}>{r.sourceType.replace("_", " ")}</td>
                <td style={tdStyle}>
                  <span style={badgeStyle(statusBadgeKind(r.status))}>{r.status}</span>
                </td>
                <td style={tdStyle}>{levelLabel(r.status, r.currentApprovalLevel)}</td>
                <td style={tdStyle}>
                  {r.status === "pending" && (
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button onClick={() => decide(r, "approved")} disabled={busyId === r.id} style={secondaryButtonStyle}>Approve</button>
                      <button onClick={() => decide(r, "rejected")} disabled={busyId === r.id} style={secondaryButtonStyle}>Reject</button>
                      <button onClick={() => cancel(r)} disabled={busyId === r.id} style={{ ...secondaryButtonStyle, color: colors.danger }}>Cancel</button>
                    </div>
                  )}
                  {r.status === "cancelled" && r.cancelledReason && (
                    <span style={{ fontSize: "0.78rem", color: colors.textFaint }}>{r.cancelledReason}</span>
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

function IndentsTab({ indents, items, departments, onChanged, setError, setMessage }: TabProps & { indents: Indent[]; items: InventoryItemRef[]; departments: DepartmentRef[] }) {
  const [departmentId, setDepartmentId] = useState("");
  const [rows, setRows] = useState<IndentItemRow[]>([]);
  const [rowItemId, setRowItemId] = useState("");
  const [rowQty, setRowQty] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function addRow() {
    const item = items.find((it) => it.id === rowItemId);
    if (!item) return;
    setRows((prev) => [...prev, { inventoryItemId: item.id, itemName: `${item.itemCode} - ${item.name}`, quantity: Number(rowQty) || 1 }]);
    setRowItemId("");
    setRowQty("1");
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (rows.length === 0) {
      setError("Add at least one item row before submitting.");
      return;
    }
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await api.post("/indents", { departmentId: departmentId || undefined, items: rows });
      setMessage("Indent submitted - awaiting Tech Manager approval.");
      setRows([]);
      setDepartmentId("");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit indent.");
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(indent: Indent, decision: "approved" | "rejected") {
    setError(null);
    setMessage(null);
    setBusyId(indent.id);
    try {
      await api.post(`/indents/${indent.id}/approve`, { decision });
      setMessage(decision === "approved" ? "Approved - moved to next level." : "Rejected.");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record decision.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <form onSubmit={handleCreate}>
        <div style={formRowStyle}>
          <label>
            <span style={labelStyle}>Department</span>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={{ ...inputStyle, width: 200 }}>
              <option value="">None</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ ...formRowStyle, marginBottom: "0.75rem" }}>
          <label>
            <span style={labelStyle}>Add item</span>
            <select value={rowItemId} onChange={(e) => setRowItemId(e.target.value)} style={{ ...inputStyle, width: 240 }}>
              <option value="">Select item</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>{it.itemCode} - {it.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span style={labelStyle}>Quantity</span>
            <input type="number" min="1" value={rowQty} onChange={(e) => setRowQty(e.target.value)} style={{ ...inputStyle, width: 100 }} />
          </label>
          <button type="button" onClick={addRow} disabled={!rowItemId} style={secondaryButtonStyle}>Add row</button>
        </div>

        {rows.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem", fontSize: "0.85rem", color: colors.textSecondary }}>
            {rows.map((r, idx) => (
              <li key={idx} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.25rem 0" }}>
                {r.itemName} &times; {r.quantity}
                <button type="button" onClick={() => removeRow(idx)} style={{ background: "none", border: "none", color: colors.danger, cursor: "pointer", fontSize: "0.78rem" }}>
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Submitting..." : "Submit indent"}
        </button>
      </form>

      <div style={{ marginTop: "2rem" }}>
        {indents.length === 0 ? (
          <p style={subheadStyle}>No indents yet.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Department</th>
                <th style={thStyle}>Items</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Awaiting</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {indents.map((i) => (
                <tr key={i.id}>
                  <td style={tdStyle}>{i.department?.name ?? "-"}</td>
                  <td style={tdStyle}>{(i.items ?? []).map((r) => `${r.itemName} x${r.quantity}`).join(", ")}</td>
                  <td style={tdStyle}>
                    <span style={badgeStyle(statusBadgeKind(i.status))}>{i.status}</span>
                  </td>
                  <td style={tdStyle}>{levelLabel(i.status, i.currentApprovalLevel)}</td>
                  <td style={tdStyle}>
                    {i.status === "pending" && (
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button onClick={() => decide(i, "approved")} disabled={busyId === i.id} style={secondaryButtonStyle}>Approve</button>
                        <button onClick={() => decide(i, "rejected")} disabled={busyId === i.id} style={secondaryButtonStyle}>Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
