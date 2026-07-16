import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { ChangePassword } from "./pages/ChangePassword";
import { Dashboard } from "./pages/Dashboard";
import { Users } from "./pages/Users";
import { Organizations } from "./pages/Organizations";
import { Employees } from "./pages/Employees";
import { MasterData } from "./pages/MasterData";
import { Inventory } from "./pages/Inventory";
import { Vendors } from "./pages/Vendors";
import { Procurement } from "./pages/Procurement";
import { Recovery } from "./pages/Recovery";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";

// The Sparquer Super Administrator is a platform-level identity with no
// organizationId (see auth.service.ts login()) - the tenant KPI Dashboard
// calls GET /dashboard, which is org-scoped and throws "This action requires
// an organization context" for a Super Admin. Their landing page is
// Organizations instead, since that's the one screen that's actually
// Super-Admin-scoped rather than org-scoped.
function Home() {
  const { user } = useAuth();
  const isSuperAdmin = user?.roles.includes("Sparquer Super Administrator");
  return isSuperAdmin ? <Organizations /> : <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/change-password" element={<ChangePassword />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/employees" element={<Employees />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/vendors" element={<Vendors />} />
              <Route path="/procurement" element={<Procurement />} />
              <Route path="/recovery" element={<Recovery />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/master-data" element={<MasterData />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/users" element={<Users />} />
              <Route path="/organizations" element={<Organizations />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
