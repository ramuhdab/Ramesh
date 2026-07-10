import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../api/client";

type DashboardData = {
  employees: { total: number; active: number };
  inventory: { activeItemCount: number; lowStockCount: number; criticalStockCount: number };
  procurement: { pendingRequests: number; pendingIndents: number };
  vendors: Record<string, number>;
  approvals: { pendingForMe: number };
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "1rem 1.25rem",
  minWidth: 180,
};

// WF25 Dashboard Refresh Workflow: on login, KPIs load for inventory,
// employees, procurement, alerts, and pending approvals (GET /dashboard,
// reporting/dashboard.service.ts) - every role gets this view.
export function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardData>("/dashboard")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard KPIs."));
  }, []);

  return (
    <div>
      <h1>Welcome, {user?.username}</h1>

      {error && <p style={{ color: "#dc2626" }}>{error}</p>}

      {data && (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "1rem" }}>
          <div style={cardStyle}>
            <strong>Employees</strong>
            <p>{data.employees.active} active / {data.employees.total} total</p>
          </div>
          <div style={cardStyle}>
            <strong>Inventory</strong>
            <p>{data.inventory.activeItemCount} active items</p>
            <p style={{ color: data.inventory.criticalStockCount > 0 ? "#dc2626" : "#475569" }}>
              {data.inventory.criticalStockCount} critical / {data.inventory.lowStockCount} low stock
            </p>
          </div>
          <div style={cardStyle}>
            <strong>Procurement</strong>
            <p>{data.procurement.pendingRequests} pending requests</p>
            <p>{data.procurement.pendingIndents} pending indents</p>
          </div>
          <div style={cardStyle}>
            <strong>My Approvals</strong>
            <p>{data.approvals.pendingForMe} awaiting your decision</p>
          </div>
          <div style={cardStyle}>
            <strong>Vendors</strong>
            {Object.entries(data.vendors).map(([status, count]) => (
              <p key={status}>{count} {status}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
