import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { NotificationBell } from "./NotificationBell";
import { colors, fontFamily, gradients } from "../theme";

const NAV_LINK_BASE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  padding: "0.55rem 0.75rem",
  borderRadius: 8,
  color: "#cbd5e1",
  fontSize: "0.9rem",
  fontWeight: 500,
  textDecoration: "none",
};

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // The Sparquer Super Administrator has no organizationId, so the
  // org-scoped Dashboard/Users/Employees/etc. endpoints all throw "This
  // action requires an organization context" for them - see App.tsx's Home
  // component for the matching fix on "/" itself. Organizations is their
  // only real screen.
  const isSuperAdmin = user?.roles.includes("Sparquer Super Administrator");

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div style={{ fontFamily, minHeight: "100vh", display: "flex", background: colors.page }}>
      <style>{`
        .spqr-nav-link:hover { background: rgba(255,255,255,0.06); color: #ffffff; }
        .spqr-nav-link.active { background: ${colors.accentSoft}; color: #ffffff; border: 1px solid ${colors.accentBorder}; }
        .spqr-logout-btn:hover { opacity: 0.85; }
      `}</style>
      <nav style={{ width: 232, background: gradients.sidebar, color: "white", padding: "1.5rem 1rem", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "2rem", padding: "0 0.25rem" }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", color: colors.accent, fontWeight: 700, fontSize: "0.85rem" }}>
            S
          </div>
          <h2 style={{ fontSize: "1.02rem", margin: 0, fontWeight: 700, letterSpacing: "-0.01em" }}>SPQR Inventory</h2>
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {isSuperAdmin ? (
            <li>
              <NavLink to="/" end className={({ isActive }) => `spqr-nav-link${isActive ? " active" : ""}`} style={NAV_LINK_BASE}>
                Organizations
              </NavLink>
            </li>
          ) : (
            <>
              <li>
                <NavLink to="/" end className={({ isActive }) => `spqr-nav-link${isActive ? " active" : ""}`} style={NAV_LINK_BASE}>
                  Dashboard
                </NavLink>
              </li>
              <li>
                <NavLink to="/employees" className={({ isActive }) => `spqr-nav-link${isActive ? " active" : ""}`} style={NAV_LINK_BASE}>
                  Employees
                </NavLink>
              </li>
              <li>
                <NavLink to="/inventory" className={({ isActive }) => `spqr-nav-link${isActive ? " active" : ""}`} style={NAV_LINK_BASE}>
                  Inventory
                </NavLink>
              </li>
              <li>
                <NavLink to="/vendors" className={({ isActive }) => `spqr-nav-link${isActive ? " active" : ""}`} style={NAV_LINK_BASE}>
                  Vendors
                </NavLink>
              </li>
              <li>
                <NavLink to="/procurement" className={({ isActive }) => `spqr-nav-link${isActive ? " active" : ""}`} style={NAV_LINK_BASE}>
                  Procurement
                </NavLink>
              </li>
              <li>
                <NavLink to="/recovery" className={({ isActive }) => `spqr-nav-link${isActive ? " active" : ""}`} style={NAV_LINK_BASE}>
                  Recovery
                </NavLink>
              </li>
              <li>
                <NavLink to="/reports" className={({ isActive }) => `spqr-nav-link${isActive ? " active" : ""}`} style={NAV_LINK_BASE}>
                  Reports
                </NavLink>
              </li>
              <li>
                <NavLink to="/master-data" className={({ isActive }) => `spqr-nav-link${isActive ? " active" : ""}`} style={NAV_LINK_BASE}>
                  Master Data
                </NavLink>
              </li>
              <li>
                <NavLink to="/settings" className={({ isActive }) => `spqr-nav-link${isActive ? " active" : ""}`} style={NAV_LINK_BASE}>
                  Settings
                </NavLink>
              </li>
              <li>
                <NavLink to="/users" className={({ isActive }) => `spqr-nav-link${isActive ? " active" : ""}`} style={NAV_LINK_BASE}>
                  Users
                </NavLink>
              </li>
            </>
          )}
        </ul>
        <div style={{ marginTop: "auto", paddingTop: "1.5rem", borderTop: "1px solid rgba(255,255,255,0.1)", fontSize: "0.82rem" }}>
          <div style={{ color: "#94a3b8", marginBottom: "0.15rem" }}>Signed in as</div>
          <div style={{ color: "white", fontWeight: 600, marginBottom: "0.75rem" }}>{user?.username}</div>
          <button
            onClick={handleLogout}
            className="spqr-logout-btn"
            style={{ width: "100%", padding: "0.5rem", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", color: "white", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", fontFamily }}
          >
            Log out
          </button>
        </div>
      </nav>
      <main style={{ flex: 1, background: colors.page, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "1rem 2.5rem 0" }}>
          <NotificationBell />
        </div>
        <div style={{ padding: "1.25rem 2.5rem 2.25rem", flex: 1 }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
