import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import {
  badgeStyle,
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

type Org = { id: string; name: string; status: string; subscriptionPlan: string };
type CreateOrgResult = {
  organization: Org;
  adminUserId: string;
  activationToken?: string;
  adminTempPassword?: string;
};

function statusBadgeKind(status: string): "success" | "warning" | "neutral" {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  return "neutral";
}

// WF1 Organization Onboarding Workflow - Sparquer Super Administrator only.
export function Organizations() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [name, setName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

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
      const result = await api.post<CreateOrgResult>("/organizations", { name, adminUsername, adminEmail });
      // No real email is sent on this deployment (MAIL_PROVIDER=console) - if
      // the API echoed back the temp password (non-production only), show it
      // directly instead of sending the Super Admin to hunt through logs.
      // Either way, click "Activate" below to skip the token step entirely.
      setMessage(
        result.adminTempPassword
          ? `Organization "${name}" created and pending activation. Admin login: ${adminUsername} / ${result.adminTempPassword} (must be changed on first login).`
          : `Organization "${name}" created and pending activation. Click "Activate" below, then log in as "${adminUsername}" (check the server logs for the temp password - console mail adapter, no real email is sent).`
      );
      setName("");
      setAdminUsername("");
      setAdminEmail("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create organization.");
    }
  }

  async function handleActivate(org: Org) {
    setError(null);
    setActivatingId(org.id);
    try {
      await api.post(`/organizations/${org.id}/activate-now`);
      setMessage(`"${org.name}" is now active. Log in as its admin to start using it.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to activate organization.");
    } finally {
      setActivatingId(null);
    }
  }

  return (
    <div>
      <h1 style={h1Style}>Organizations</h1>
      <p style={subheadStyle}>Onboard new tenant organizations and manage their activation status.</p>

      <form onSubmit={handleCreate} style={formRowStyle}>
        <label>
          <span style={labelStyle}>Organization name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ ...inputStyle, width: 220 }} />
        </label>
        <label>
          <span style={labelStyle}>Admin username</span>
          <input value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} required style={{ ...inputStyle, width: 180 }} />
        </label>
        <label>
          <span style={labelStyle}>Admin email</span>
          <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required style={{ ...inputStyle, width: 220 }} />
        </label>
        <button type="submit" style={primaryButtonStyle}>Create organization</button>
      </form>

      {error && <div style={errorBannerStyle}>{error}</div>}
      {message && <div style={successBannerStyle}>{message}</div>}

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Plan</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => (
            <tr key={o.id}>
              <td style={tdStyle}>{o.name}</td>
              <td style={tdStyle}>
                <span style={badgeStyle(statusBadgeKind(o.status))}>{o.status}</span>
              </td>
              <td style={tdStyle}>{o.subscriptionPlan}</td>
              <td style={tdStyle}>
                {o.status === "pending" && (
                  <button onClick={() => handleActivate(o)} disabled={activatingId === o.id} style={{ ...secondaryButtonStyle, opacity: activatingId === o.id ? 0.6 : 1 }}>
                    {activatingId === o.id ? "Activating..." : "Activate"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
