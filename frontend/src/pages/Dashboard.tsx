import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../api/client";
import { cardStyle, colors, errorBannerStyle, h1Style, subheadStyle } from "../theme";

type DashboardData = {
  employees: { total: number; active: number };
  inventory: { activeItemCount: number; lowStockCount: number; criticalStockCount: number };
  procurement: { pendingRequests: number; pendingIndents: number };
  vendors: Record<string, number>;
  approvals: { pendingForMe: number };
};

const kpiCardStyle: React.CSSProperties = {
  ...cardStyle,
  minWidth: 200,
  flex: "1 1 200px",
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: colors.textFaint,
  margin: "0 0 0.5rem",
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: "1.65rem",
  fontWeight: 700,
  color: colors.textPrimary,
  margin: "0 0 0.15rem",
};

const kpiSubStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  color: colors.textMuted,
  margin: 0,
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
      <h1 style={h1Style}>Welcome, {user?.username}</h1>
      <p style={subheadStyle}>Here's what's happening across your organization today.</p>

      {error && <div style={errorBannerStyle}>{error}</div>}

      {data && (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div style={kpiCardStyle}>
            <p style={kpiLabelStyle}>Employees</p>
            <p style={kpiValueStyle}>{data.employees.active}</p>
            <p style={kpiSubStyle}>active of {data.employees.total} total</p>
          </div>
          <div style={kpiCardStyle}>
            <p style={kpiLabelStyle}>Inventory</p>
            <p style={kpiValueStyle}>{data.inventory.activeItemCount}</p>
            <p style={{ ...kpiSubStyle, color: data.inventory.criticalStockCount > 0 ? colors.danger : colors.textMuted, fontWeight: data.inventory.criticalStockCount > 0 ? 600 : 400 }}>
              {data.inventory.criticalStockCount} critical &middot; {data.inventory.lowStockCount} low stock
            </p>
          </div>
          <div style={kpiCardStyle}>
            <p style={kpiLabelStyle}>Procurement</p>
            <p style={kpiValueStyle}>{data.procurement.pendingRequests}</p>
            <p style={kpiSubStyle}>pending requests &middot; {data.procurement.pendingIndents} pending indents</p>
          </div>
          <div style={kpiCardStyle}>
            <p style={kpiLabelStyle}>My Approvals</p>
            <p style={kpiValueStyle}>{data.approvals.pendingForMe}</p>
            <p style={kpiSubStyle}>awaiting your decision</p>
          </div>
          <div style={kpiCardStyle}>
            <p style={kpiLabelStyle}>Vendors</p>
            {Object.entries(data.vendors).length === 0 && <p style={kpiSubStyle}>No vendors yet</p>}
            {Object.entries(data.vendors).map(([status, count]) => (
              <p key={status} style={kpiSubStyle}>{count} {status}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
