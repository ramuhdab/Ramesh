import { Fragment, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { AttachmentsPanel } from "../components/AttachmentsPanel";
import {
  badgeStyle,
  colors,
  errorBannerStyle,
  formRowStyle,
  h1Style,
  inputStyle,
  labelStyle,
  primaryButtonStyle,
  subheadStyle,
  tableStyle,
  tdStyle,
  thStyle,
} from "../theme";

type Role = { id: string; name: string };
type UserRow = { id: string; username: string; email: string; isActive: boolean; roles: { role: Role }[] };

// WF2 User Registration Workflow.
export function Users() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [userList, roleList] = await Promise.all([api.get<UserRow[]>("/users"), api.get<Role[]>("/roles")]);
      setUsers(userList);
      setRoles(roleList);
      if (roleList[0]) setRoleId(roleList[0].id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/users", { username, email, roleIds: [roleId] });
      setUsername("");
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user.");
    }
  }

  return (
    <div>
      <h1 style={h1Style}>Users</h1>
      <p style={subheadStyle}>Manage who can sign in to this organization and what role they hold.</p>

      <form onSubmit={handleCreate} style={formRowStyle}>
        <label>
          <span style={labelStyle}>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required style={{ ...inputStyle, width: 200 }} />
        </label>
        <label>
          <span style={labelStyle}>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ ...inputStyle, width: 240 }} />
        </label>
        <label>
          <span style={labelStyle}>Role</span>
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)} style={{ ...inputStyle, width: 200 }}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" style={primaryButtonStyle}>Create user</button>
      </form>

      {error && <div style={errorBannerStyle}>{error}</div>}
      {loading ? (
        <p style={subheadStyle}>Loading...</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Username</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Roles</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <Fragment key={u.id}>
                <tr>
                  <td style={tdStyle}>{u.username}</td>
                  <td style={tdStyle}>{u.email}</td>
                  <td style={tdStyle}>{u.roles.map((r) => r.role.name).join(", ")}</td>
                  <td style={tdStyle}>
                    <span style={badgeStyle(u.isActive ? "success" : "neutral")}>{u.isActive ? "Active" : "Inactive"}</span>
                  </td>
                  <td style={tdStyle}>
                    <button onClick={() => setExpandedId(expandedId === u.id ? null : u.id)} style={{ background: "none", border: "none", color: colors.accent, cursor: "pointer", fontSize: "0.8rem", padding: 0 }}>
                      {expandedId === u.id ? "Hide files" : "Attachments"}
                    </button>
                  </td>
                </tr>
                {expandedId === u.id && (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, background: colors.surfaceMuted }}>
                      <AttachmentsPanel entityType="user" entityId={u.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
