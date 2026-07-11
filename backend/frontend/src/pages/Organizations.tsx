import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

type Org = { id: string; name: string; status: string; subscriptionPlan: string };

// WF1 Organization Onboarding Workflow - Sparquer Super Administrator only.
export function Organizations() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [name, setName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    try {
      setOrgs(await api.get<Org[]>("/organizations"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load organizations.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api.post("/organizations", { name, adminUsername, adminEmail });
      setMessage(`Organization "${name}" created. Activation email sent to ${adminEmail}.`);
      setName("");
      setAdminUsername("");
      setAdminEmail("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create organization.");
    }
  }

  return (
    <div>
      <h1>Organizations</h1>
      <form onSubmit={handleCreate} style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", alignItems: "end" }}>
        <label>
          Organization name
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ display: "block", padding: 6 }} />
        </label>
        <label>
          Admin username
          <input value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} required style={{ display: "block", padding: 6 }} />
        </label>
        <label>
          Admin email
          <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required style={{ display: "block", padding: 6 }} />
        </label>
        <button type="submit">Create organization</button>
      </form>
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      {message && <p style={{ color: "#16a34a" }}>{message}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #cbd5e1" }}>
            <th>Name</th>
            <th>Status</th>
            <th>Plan</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => (
            <tr key={o.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td>{o.name}</td>
              <td>{o.status}</td>
              <td>{o.subscriptionPlan}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
