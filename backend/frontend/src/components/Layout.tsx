import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", display: "flex" }}>
      <nav style={{ width: 220, background: "#0f172a", color: "white", padding: "1.5rem 1rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "1.5rem" }}>SPQR Inventory</h2>
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <li><Link style={{ color: "white" }} to="/">Dashboard</Link></li>
          <li><Link style={{ color: "white" }} to="/users">Users</Link></li>
          {user?.roles.includes("Sparquer Super Administrator") && (
            <li><Link style={{ color: "white" }} to="/organizations">Organizations</Link></li>
          )}
        </ul>
        <div style={{ marginTop: "2rem", fontSize: "0.85rem", opacity: 0.8 }}>
          Signed in as {user?.username}
          <br />
          <button onClick={handleLogout} style={{ marginTop: "0.5rem" }}>
            Log out
          </button>
        </div>
      </nav>
      <main style={{ flex: 1, padding: "2rem", background: "#f8fafc" }}>
        <Outlet />
      </main>
    </div>
  );
}
