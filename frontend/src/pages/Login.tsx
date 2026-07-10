import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(username, password);
      if (result.mustChangePassword) {
        navigate("/change-password");
      } else {
        navigate("/");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", background: "#f8fafc" }}>
      <form onSubmit={handleSubmit} style={{ background: "white", padding: "2.5rem", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.1)", width: 340 }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "1.5rem" }}>SPQR Inventory Management</h1>
        <label style={{ display: "block", marginBottom: "0.75rem" }}>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }} />
        </label>
        <label style={{ display: "block", marginBottom: "1rem" }}>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }} />
        </label>
        {error && <p style={{ color: "#dc2626", fontSize: "0.9rem" }}>{error}</p>}
        <button type="submit" disabled={submitting} style={{ width: "100%", padding: 10, background: "#0f172a", color: "white", border: "none", borderRadius: 4 }}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
