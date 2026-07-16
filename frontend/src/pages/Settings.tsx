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

type Role = { id: string; name: string };
type ItemRef = { id: string; itemCode: string; name: string };

type ApprovalWorkflow = {
  id: string;
  processType: "procurement" | "indent";
  levels: string[];
  escalationHours: number;
  isActive: boolean;
};

type NotificationSetting = {
  id: string;
  channel: "email" | "bell" | "sms" | "push";
  reminderFrequency: string | null;
  isActive: boolean;
};

type StockThreshold = {
  id: string;
  inventoryItemId: string | null;
  lowStockQty: number;
  criticalStockQty: number;
  isActive: boolean;
};

const TABS = [
  { key: "approval", label: "Approval Workflows" },
  { key: "notifications", label: "Notification Settings" },
  { key: "thresholds", label: "Stock Thresholds" },
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
 * WF35 System Configuration & Master Data Management Workflow - the
 * "process configuration" half (approval chains, notification channels,
 * stock alert thresholds), as opposed to MasterData.tsx which covers the
 * "org structure" half (Buildings/Departments/Positions/Categories). Split
 * into two screens because these are conceptually different admin tasks,
 * even though both ride the same generic master-data CRUD API
 * (masterData.factory.ts).
 */
export function Settings() {
  const [tab, setTab] = useState<TabKey>("approval");
  const [roles, setRoles] = useState<Role[]>([]);
  const [items, setItems] = useState<ItemRef[]>([]);
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [notifSettings, setNotifSettings] = useState<NotificationSetting[]>([]);
  const [thresholds, setThresholds] = useState<StockThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [roleList, itemList, workflowList, notifList, thresholdList] = await Promise.all([
        api.get<Role[]>("/roles"),
        api.get<ItemRef[]>("/inventory/items"),
        api.get<ApprovalWorkflow[]>("/config/approval-workflows"),
        api.get<NotificationSetting[]>("/config/notification-settings"),
        api.get<StockThreshold[]>("/config/stock-thresholds"),
      ]);
      setRoles(roleList);
      setItems(itemList);
      setWorkflows(workflowList);
      setNotifSettings(notifList);
      setThresholds(thresholdList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load settings.");
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
      <h1 style={h1Style}>Settings</h1>
      <p style={subheadStyle}>Configure approval chains, notification channels, and stock alert thresholds for this organization.</p>

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
          {tab === "approval" && <ApprovalTab workflows={workflows} roles={roles} onChanged={loadAll} setError={setError} setMessage={setMessage} />}
          {tab === "notifications" && <NotificationsTab settings={notifSettings} onChanged={loadAll} setError={setError} setMessage={setMessage} />}
          {tab === "thresholds" && <ThresholdsTab thresholds={thresholds} items={items} onChanged={loadAll} setError={setError} setMessage={setMessage} />}
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

function ApprovalTab({ workflows, roles, onChanged, setError, setMessage }: TabProps & { workflows: ApprovalWorkflow[]; roles: Role[] }) {
  const [processType, setProcessType] = useState<"procurement" | "indent">("procurement");
  const [levels, setLevels] = useState<string[]>([]);
  const [levelToAdd, setLevelToAdd] = useState("");
  const [escalationHours, setEscalationHours] = useState("24");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function addLevel() {
    if (!levelToAdd) return;
    setLevels((prev) => [...prev, levelToAdd]);
    setLevelToAdd("");
  }

  function removeLevel(idx: number) {
    setLevels((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (levels.length === 0) {
      setError("Add at least one approval level before saving.");
      return;
    }
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await api.post("/config/approval-workflows", { processType, levels, escalationHours: Number(escalationHours) });
      setMessage(`Approval workflow saved for "${processType}" - ${levels.length} level(s).`);
      setLevels([]);
      setEscalationHours("24");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save approval workflow.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deactivate(w: ApprovalWorkflow) {
    setError(null);
    setBusyId(w.id);
    try {
      await api.delete(`/config/approval-workflows/${w.id}`);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to deactivate workflow.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <p style={subheadStyle}>
        Overrides the default 4-level chain (Tech Manager &rarr; Senior Manager &rarr; Finance &rarr; Managing Director) for
        Procurement or Indent approvals. Only one active workflow per process type is used - the most recently created active one.
      </p>
      <form onSubmit={handleCreate}>
        <div style={formRowStyle}>
          <label>
            <span style={labelStyle}>Process</span>
            <select value={processType} onChange={(e) => setProcessType(e.target.value as "procurement" | "indent")} style={{ ...inputStyle, width: 160 }}>
              <option value="procurement">Procurement</option>
              <option value="indent">Indent</option>
            </select>
          </label>
          <label>
            <span style={labelStyle}>Escalation (hours)</span>
            <input type="number" min="1" value={escalationHours} onChange={(e) => setEscalationHours(e.target.value)} style={{ ...inputStyle, width: 140 }} />
          </label>
        </div>

        <div style={{ ...formRowStyle, marginBottom: "0.75rem" }}>
          <label>
            <span style={labelStyle}>Add level (role)</span>
            <select value={levelToAdd} onChange={(e) => setLevelToAdd(e.target.value)} style={{ ...inputStyle, width: 220 }}>
              <option value="">Select role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={addLevel} disabled={!levelToAdd} style={secondaryButtonStyle}>Add level</button>
        </div>

        {levels.length > 0 && (
          <ol style={{ margin: "0 0 1rem", paddingLeft: "1.25rem", fontSize: "0.85rem", color: colors.textSecondary }}>
            {levels.map((lvl, idx) => (
              <li key={idx} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.15rem 0" }}>
                {lvl}
                <button type="button" onClick={() => removeLevel(idx)} style={{ background: "none", border: "none", color: colors.danger, cursor: "pointer", fontSize: "0.76rem" }}>
                  remove
                </button>
              </li>
            ))}
          </ol>
        )}

        <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Saving..." : "Save approval workflow"}
        </button>
      </form>

      {workflows.length > 0 && (
        <table style={{ ...tableStyle, marginTop: "1.75rem" }}>
          <thead>
            <tr>
              <th style={thStyle}>Process</th>
              <th style={thStyle}>Levels</th>
              <th style={thStyle}>Escalation</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {workflows.map((w) => (
              <tr key={w.id}>
                <td style={tdStyle}>{w.processType}</td>
                <td style={tdStyle}>{w.levels.join(" → ")}</td>
                <td style={tdStyle}>{w.escalationHours}h</td>
                <td style={tdStyle}>
                  <span style={badgeStyle(w.isActive ? "success" : "neutral")}>{w.isActive ? "Active" : "Inactive"}</span>
                </td>
                <td style={tdStyle}>
                  {w.isActive && (
                    <button onClick={() => deactivate(w)} disabled={busyId === w.id} style={secondaryButtonStyle}>Deactivate</button>
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

function NotificationsTab({ settings, onChanged, setError, setMessage }: TabProps & { settings: NotificationSetting[] }) {
  const [channel, setChannel] = useState<"email" | "bell" | "sms" | "push">("email");
  const [reminderFrequency, setReminderFrequency] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await api.post("/config/notification-settings", { channel, reminderFrequency: reminderFrequency || undefined });
      setMessage(`Notification setting saved for "${channel}".`);
      setReminderFrequency("");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save notification setting.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deactivate(s: NotificationSetting) {
    setError(null);
    setBusyId(s.id);
    try {
      await api.delete(`/config/notification-settings/${s.id}`);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to deactivate setting.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <p style={subheadStyle}>Controls which channels fire for domain events (WF22) and how often reminders repeat.</p>
      <form onSubmit={handleCreate} style={formRowStyle}>
        <label>
          <span style={labelStyle}>Channel</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} style={{ ...inputStyle, width: 160 }}>
            <option value="email">Email</option>
            <option value="bell">Bell</option>
            <option value="sms">SMS</option>
            <option value="push">Push</option>
          </select>
        </label>
        <label>
          <span style={labelStyle}>Reminder Frequency</span>
          <input value={reminderFrequency} onChange={(e) => setReminderFrequency(e.target.value)} style={{ ...inputStyle, width: 180 }} placeholder="e.g. daily, 24h" />
        </label>
        <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Saving..." : "Add setting"}
        </button>
      </form>

      {settings.length === 0 ? (
        <p style={subheadStyle}>No notification settings configured yet - defaults apply (bell always on).</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Channel</th>
              <th style={thStyle}>Reminder Frequency</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {settings.map((s) => (
              <tr key={s.id}>
                <td style={tdStyle}>{s.channel}</td>
                <td style={tdStyle}>{s.reminderFrequency ?? "-"}</td>
                <td style={tdStyle}>
                  <span style={badgeStyle(s.isActive ? "success" : "neutral")}>{s.isActive ? "Active" : "Inactive"}</span>
                </td>
                <td style={tdStyle}>
                  {s.isActive && (
                    <button onClick={() => deactivate(s)} disabled={busyId === s.id} style={secondaryButtonStyle}>Deactivate</button>
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

function ThresholdsTab({ thresholds, items, onChanged, setError, setMessage }: TabProps & { thresholds: StockThreshold[]; items: ItemRef[] }) {
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [lowStockQty, setLowStockQty] = useState("20");
  const [criticalStockQty, setCriticalStockQty] = useState("5");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function itemLabel(id: string | null) {
    if (!id) return "All items (default)";
    const item = items.find((it) => it.id === id);
    return item ? `${item.itemCode} - ${item.name}` : id;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await api.post("/config/stock-thresholds", {
        inventoryItemId: inventoryItemId || undefined,
        lowStockQty: Number(lowStockQty),
        criticalStockQty: Number(criticalStockQty),
      });
      setMessage("Stock threshold saved.");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save threshold.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deactivate(t: StockThreshold) {
    setError(null);
    setBusyId(t.id);
    try {
      await api.delete(`/config/stock-thresholds/${t.id}`);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to deactivate threshold.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <p style={subheadStyle}>Per-item low/critical stock levels used by the Inventory alerts and procurement triggers (WF18/WF19). Leave item unset for an org-wide default.</p>
      <form onSubmit={handleCreate} style={formRowStyle}>
        <label>
          <span style={labelStyle}>Item</span>
          <select value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)} style={{ ...inputStyle, width: 220 }}>
            <option value="">All items (default)</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>{it.itemCode} - {it.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>Low Stock Qty</span>
          <input type="number" min="0" value={lowStockQty} onChange={(e) => setLowStockQty(e.target.value)} required style={{ ...inputStyle, width: 130 }} />
        </label>
        <label>
          <span style={labelStyle}>Critical Stock Qty</span>
          <input type="number" min="0" value={criticalStockQty} onChange={(e) => setCriticalStockQty(e.target.value)} required style={{ ...inputStyle, width: 150 }} />
        </label>
        <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Saving..." : "Save threshold"}
        </button>
      </form>

      {thresholds.length === 0 ? (
        <p style={subheadStyle}>No custom thresholds yet - every item uses the default (low &lt;20, critical &lt;5).</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Item</th>
              <th style={thStyle}>Low Stock Qty</th>
              <th style={thStyle}>Critical Stock Qty</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {thresholds.map((t) => (
              <tr key={t.id}>
                <td style={tdStyle}>{itemLabel(t.inventoryItemId)}</td>
                <td style={tdStyle}>{t.lowStockQty}</td>
                <td style={tdStyle}>{t.criticalStockQty}</td>
                <td style={tdStyle}>
                  <span style={badgeStyle(t.isActive ? "success" : "neutral")}>{t.isActive ? "Active" : "Inactive"}</span>
                </td>
                <td style={tdStyle}>
                  {t.isActive && (
                    <button onClick={() => deactivate(t)} disabled={busyId === t.id} style={secondaryButtonStyle}>Deactivate</button>
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
