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

type Ref = { id: string; name: string };
type Category = { id: string; name: string };
type InventoryItem = {
  id: string;
  itemCode: string;
  name: string;
  inventoryCategoryId: string | null;
  inventoryCategory: Category | null;
  unitCost: number | null;
  currentStockQty: number;
  isActive: boolean;
};
type StockAlert = { itemId: string; itemCode: string; name: string; currentStockQty: number; level: "critical" | "low" };
type EmployeeRef = { id: string; employeeCode: string; name: string; status: string };
type ItemReturnRow = { id: string; quantity: number; condition: string; disposition: string; returnedAt: string };
type Issuance = {
  id: string;
  quantity: number;
  issuedAt: string;
  employee: { id: string; employeeCode: string; name: string };
  inventoryItem: { id: string; itemCode: string; name: string };
  returns: ItemReturnRow[];
};

const TABS = [
  { key: "items", label: "Items & Stock" },
  { key: "receive", label: "Receive Stock" },
  { key: "issue", label: "Issue to Employee" },
  { key: "returns", label: "Returns" },
  { key: "replace", label: "Replace Item" },
  { key: "adjust", label: "Adjust Stock" },
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

function stockBadgeKind(item: InventoryItem, alerts: StockAlert[]): "danger" | "warning" | "success" {
  const alert = alerts.find((a) => a.itemId === item.id);
  if (alert?.level === "critical") return "danger";
  if (alert?.level === "low") return "warning";
  return "success";
}

function outstandingQty(issuance: Issuance): number {
  const returned = issuance.returns.reduce((sum, r) => sum + r.quantity, 0);
  return issuance.quantity - returned;
}

/**
 * Inventory Core module (WF8 Goods Receipt, WF9 Issue, WF10 Return, WF14
 * Adjustment) - the module the whole cost-recovery story depends on: which
 * employee has which item, in what quantity, since when (BRD FR-8/FR-13).
 * One tabbed page instead of five separate routes, since these all operate
 * on the same small set of entities (items, issuances, returns) and an Org
 * Admin/Store Keeper moves between them constantly in one sitting.
 */
export function Inventory() {
  const [tab, setTab] = useState<TabKey>("items");

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [employees, setEmployees] = useState<EmployeeRef[]>([]);
  const [issuances, setIssuances] = useState<Issuance[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [itemList, alertList, categoryList, employeeList, issuanceList] = await Promise.all([
        api.get<InventoryItem[]>("/inventory/items"),
        api.get<StockAlert[]>("/inventory/alerts"),
        api.get<Category[]>("/config/inventory-categories"),
        api.get<EmployeeRef[]>("/employees"),
        api.get<Issuance[]>("/inventory/issuances"),
      ]);
      setItems(itemList);
      setAlerts(alertList);
      setCategories(categoryList);
      setEmployees(employeeList.filter((e) => e.status === "active" || e.status === "transferred"));
      setIssuances(issuanceList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load inventory data.");
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
      <h1 style={h1Style}>Inventory</h1>
      <p style={subheadStyle}>Stock levels, goods receipt, employee issuance, returns, and manual adjustments.</p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => switchTab(t.key)} style={tabButtonStyle(t.key === tab)}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div style={errorBannerStyle}>{error}</div>}
      {message && <div style={successBannerStyle}>{message}</div>}

      {loading ? (
        <p style={subheadStyle}>Loading...</p>
      ) : (
        <>
          {tab === "items" && (
            <ItemsTab items={items} alerts={alerts} categories={categories} onChanged={loadAll} setError={setError} setMessage={setMessage} />
          )}
          {tab === "receive" && <ReceiveTab items={items} onChanged={loadAll} setError={setError} setMessage={setMessage} />}
          {tab === "issue" && (
            <IssueTab items={items} employees={employees} onChanged={loadAll} setError={setError} setMessage={setMessage} />
          )}
          {tab === "returns" && <ReturnsTab issuances={issuances} onChanged={loadAll} setError={setError} setMessage={setMessage} />}
          {tab === "replace" && (
            <ReplaceTab items={items} employees={employees} issuances={issuances} onChanged={loadAll} setError={setError} setMessage={setMessage} />
          )}
          {tab === "adjust" && <AdjustTab items={items} onChanged={loadAll} setError={setError} setMessage={setMessage} />}
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

function ItemsTab({ items, alerts, categories, onChanged, setError, setMessage }: TabProps & { items: InventoryItem[]; alerts: StockAlert[]; categories: Category[] }) {
  const [itemCode, setItemCode] = useState("");
  const [name, setName] = useState("");
  const [inventoryCategoryId, setInventoryCategoryId] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await api.post("/inventory/items", {
        itemCode,
        name,
        inventoryCategoryId: inventoryCategoryId || undefined,
        unitCost: unitCost ? Number(unitCost) : undefined,
      });
      setMessage(`Item "${name}" added.`);
      setItemCode("");
      setName("");
      setUnitCost("");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create item.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleCreate} style={formRowStyle}>
        <label>
          <span style={labelStyle}>Item Code</span>
          <input value={itemCode} onChange={(e) => setItemCode(e.target.value)} required style={{ ...inputStyle, width: 140 }} placeholder="e.g. SHOE-STD" />
        </label>
        <label>
          <span style={labelStyle}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ ...inputStyle, width: 200 }} />
        </label>
        <label>
          <span style={labelStyle}>Category</span>
          <select value={inventoryCategoryId} onChange={(e) => setInventoryCategoryId(e.target.value)} style={{ ...inputStyle, width: 180 }}>
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>Unit Cost</span>
          <input type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} style={{ ...inputStyle, width: 120 }} />
        </label>
        <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Adding..." : "Add item"}
        </button>
      </form>

      {items.length === 0 ? (
        <p style={subheadStyle}>No inventory items yet - add one above.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Item Code</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Unit Cost</th>
              <th style={thStyle}>Stock</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td style={tdStyle}>{it.itemCode}</td>
                <td style={tdStyle}>{it.name}</td>
                <td style={tdStyle}>{it.inventoryCategory?.name ?? "-"}</td>
                <td style={tdStyle}>{it.unitCost != null ? `₹${Number(it.unitCost).toFixed(2)}` : "-"}</td>
                <td style={tdStyle}>
                  <span style={badgeStyle(stockBadgeKind(it, alerts))}>{it.currentStockQty} in stock</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ReceiveTab({ items, onChanged, setError, setMessage }: TabProps & { items: InventoryItem[] }) {
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitDecision(decision: "accept" | "reject") {
    if (!inventoryItemId || !quantity) {
      setError("Select an item and enter a quantity.");
      return;
    }
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await api.post("/inventory/goods-receipt", { inventoryItemId, quantity: Number(quantity), decision });
      setMessage(
        decision === "accept"
          ? `Received ${quantity} unit(s) - stock updated.`
          : `Delivery of ${quantity} unit(s) rejected - stock unchanged.`
      );
      setQuantity("");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record goods receipt.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p style={subheadStyle}>WF8 Goods Receipt - inspect a vendor delivery and accept it into stock, or reject it.</p>
      <div style={formRowStyle}>
        <label>
          <span style={labelStyle}>Item</span>
          <select value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)} style={{ ...inputStyle, width: 220 }}>
            <option value="">Select item</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>{it.itemCode} - {it.name} ({it.currentStockQty} in stock)</option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>Quantity Delivered</span>
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ ...inputStyle, width: 140 }} />
        </label>
        <button type="button" disabled={submitting} onClick={() => submitDecision("accept")} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
          Accept &amp; Add to Stock
        </button>
        <button type="button" disabled={submitting} onClick={() => submitDecision("reject")} style={secondaryButtonStyle}>
          Reject Delivery
        </button>
      </div>
    </div>
  );
}

function IssueTab({ items, employees, onChanged, setError, setMessage }: TabProps & { items: InventoryItem[]; employees: EmployeeRef[] }) {
  const [employeeId, setEmployeeId] = useState("");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [signatureRef, setSignatureRef] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await api.post("/inventory/issue", {
        employeeId,
        inventoryItemId,
        quantity: Number(quantity),
        signatureRef: signatureRef || undefined,
      });
      setMessage("Item issued to employee - stock and employee inventory record updated.");
      setSignatureRef("");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to issue item.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p style={subheadStyle}>WF9 Inventory Issue - only active employees are eligible; annual allocation per item category is enforced automatically.</p>
      {employees.length === 0 ? (
        <div style={errorBannerStyle}>No active employees found. Create one on the Employees screen first.</div>
      ) : (
        <form onSubmit={handleSubmit} style={formRowStyle}>
          <label>
            <span style={labelStyle}>Employee</span>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required style={{ ...inputStyle, width: 220 }}>
              <option value="" disabled>Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.employeeCode} - {e.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span style={labelStyle}>Item</span>
            <select value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)} required style={{ ...inputStyle, width: 220 }}>
              <option value="" disabled>Select item</option>
              {items.map((it) => (
                <option key={it.id} value={it.id} disabled={it.currentStockQty <= 0}>
                  {it.itemCode} - {it.name} ({it.currentStockQty} in stock)
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={labelStyle}>Quantity</span>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required style={{ ...inputStyle, width: 100 }} />
          </label>
          <label>
            <span style={labelStyle}>Signature Ref (optional)</span>
            <input value={signatureRef} onChange={(e) => setSignatureRef(e.target.value)} style={{ ...inputStyle, width: 180 }} />
          </label>
          <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
            {submitting ? "Issuing..." : "Issue item"}
          </button>
        </form>
      )}
    </div>
  );
}

function ReturnsTab({ issuances, onChanged, setError, setMessage }: TabProps & { issuances: Issuance[] }) {
  const [itemIssuanceId, setItemIssuanceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState<"good" | "damaged">("good");
  const [submitting, setSubmitting] = useState(false);

  const returnable = issuances.filter((i) => outstandingQty(i) > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await api.post("/inventory/return", { itemIssuanceId, quantity: Number(quantity), condition });
      setMessage(
        condition === "good"
          ? "Item returned in good condition - restocked."
          : "Item returned damaged - scrapped, and a recovery case was opened."
      );
      setItemIssuanceId("");
      setQuantity("1");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record return.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p style={subheadStyle}>WF10 Inventory Return - good condition restocks automatically; damaged items are scrapped and flagged for recovery.</p>
      {returnable.length === 0 ? (
        <p style={subheadStyle}>Nothing outstanding to return right now.</p>
      ) : (
        <form onSubmit={handleSubmit} style={formRowStyle}>
          <label>
            <span style={labelStyle}>Issuance</span>
            <select value={itemIssuanceId} onChange={(e) => setItemIssuanceId(e.target.value)} required style={{ ...inputStyle, width: 320 }}>
              <option value="" disabled>Select issuance</option>
              {returnable.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.employee.employeeCode} - {i.inventoryItem.name} (outstanding {outstandingQty(i)} of {i.quantity})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={labelStyle}>Quantity</span>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required style={{ ...inputStyle, width: 100 }} />
          </label>
          <label>
            <span style={labelStyle}>Condition</span>
            <select value={condition} onChange={(e) => setCondition(e.target.value as "good" | "damaged")} style={{ ...inputStyle, width: 140 }}>
              <option value="good">Good</option>
              <option value="damaged">Damaged</option>
            </select>
          </label>
          <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
            {submitting ? "Recording..." : "Record return"}
          </button>
        </form>
      )}

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Employee</th>
            <th style={thStyle}>Item</th>
            <th style={thStyle}>Issued</th>
            <th style={thStyle}>Quantity</th>
            <th style={thStyle}>Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {issuances.map((i) => (
            <tr key={i.id}>
              <td style={tdStyle}>{i.employee.employeeCode} - {i.employee.name}</td>
              <td style={tdStyle}>{i.inventoryItem.name}</td>
              <td style={tdStyle}>{new Date(i.issuedAt).toLocaleDateString()}</td>
              <td style={tdStyle}>{i.quantity}</td>
              <td style={tdStyle}>
                {outstandingQty(i) > 0 ? (
                  <span style={badgeStyle("warning")}>{outstandingQty(i)} outstanding</span>
                ) : (
                  <span style={badgeStyle("neutral")}>Settled</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReplaceTab({ items, employees, issuances, onChanged, setError, setMessage }: TabProps & { items: InventoryItem[]; employees: EmployeeRef[]; issuances: Issuance[] }) {
  const [employeeId, setEmployeeId] = useState("");
  const [oldItemIssuanceId, setOldItemIssuanceId] = useState("");
  const [newInventoryItemId, setNewInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const employeeIssuances = issuances.filter((i) => i.employee.id === employeeId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await api.post("/inventory/replace", {
        employeeId,
        oldItemIssuanceId: oldItemIssuanceId || undefined,
        newInventoryItemId,
        quantity: Number(quantity),
        reason,
      });
      setMessage("Replacement issued - a new issuance was created for the employee.");
      setOldItemIssuanceId("");
      setReason("");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to issue replacement - this action requires manager approval permission.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p style={subheadStyle}>
        WF11 Inventory Replacement - issues a new item to an employee (e.g. for wear-and-tear), optionally referencing the
        original issuance being replaced. Manager-approved, same permission as Adjust Stock.
      </p>
      {employees.length === 0 ? (
        <div style={errorBannerStyle}>No active employees found. Create one on the Employees screen first.</div>
      ) : (
        <form onSubmit={handleSubmit} style={formRowStyle}>
          <label>
            <span style={labelStyle}>Employee</span>
            <select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setOldItemIssuanceId(""); }} required style={{ ...inputStyle, width: 220 }}>
              <option value="" disabled>Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.employeeCode} - {e.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span style={labelStyle}>Original Issuance (optional)</span>
            <select value={oldItemIssuanceId} onChange={(e) => setOldItemIssuanceId(e.target.value)} style={{ ...inputStyle, width: 240 }} disabled={!employeeId}>
              <option value="">None</option>
              {employeeIssuances.map((i) => (
                <option key={i.id} value={i.id}>{i.inventoryItem.itemCode} - {i.inventoryItem.name} (issued {new Date(i.issuedAt).toLocaleDateString()})</option>
              ))}
            </select>
          </label>
          <label>
            <span style={labelStyle}>New Item</span>
            <select value={newInventoryItemId} onChange={(e) => setNewInventoryItemId(e.target.value)} required style={{ ...inputStyle, width: 220 }}>
              <option value="" disabled>Select item</option>
              {items.map((it) => (
                <option key={it.id} value={it.id} disabled={it.currentStockQty <= 0}>
                  {it.itemCode} - {it.name} ({it.currentStockQty} in stock)
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={labelStyle}>Quantity</span>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required style={{ ...inputStyle, width: 100 }} />
          </label>
          <label>
            <span style={labelStyle}>Reason</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} required style={{ ...inputStyle, width: 240 }} placeholder="e.g. worn out, damaged beyond repair" />
          </label>
          <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
            {submitting ? "Issuing..." : "Issue replacement"}
          </button>
        </form>
      )}
    </div>
  );
}

function AdjustTab({ items, onChanged, setError, setMessage }: TabProps & { items: InventoryItem[] }) {
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await api.post("/inventory/adjust", { inventoryItemId, newQuantity: Number(newQuantity), reason });
      setMessage("Stock count adjusted.");
      setReason("");
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to adjust stock - this action requires manager approval permission.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p style={subheadStyle}>WF14 Inventory Adjustment - manager-approved correction after a physical stock count. Requires the same permission as approving replacements.</p>
      <form onSubmit={handleSubmit} style={formRowStyle}>
        <label>
          <span style={labelStyle}>Item</span>
          <select value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)} required style={{ ...inputStyle, width: 220 }}>
            <option value="" disabled>Select item</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>{it.itemCode} - {it.name} (currently {it.currentStockQty})</option>
            ))}
          </select>
        </label>
        <label>
          <span style={labelStyle}>Corrected Quantity</span>
          <input type="number" min="0" value={newQuantity} onChange={(e) => setNewQuantity(e.target.value)} required style={{ ...inputStyle, width: 140 }} />
        </label>
        <label>
          <span style={labelStyle}>Reason</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} required style={{ ...inputStyle, width: 260 }} placeholder="e.g. physical count variance" />
        </label>
        <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Saving..." : "Apply adjustment"}
        </button>
      </form>
    </div>
  );
}
