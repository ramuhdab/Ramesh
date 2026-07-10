import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

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
      <h1>Users</h1>

      <form onSubmit={handleCreate} style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", alignItems: "end" }}>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required style={{ display: "block", padding: 6 }} />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ display: "block", padding: 6 }} />
        </label>
        <label>
          Role
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)} style={{ display: "block", padding: 6 }}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <button type="submit">Create user</button>
      </form>

      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #cbd5e1" }}>
              <th>Username</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{u.roles.map((r) => r.role.name).join(", ")}</td>
                <td>{u.isActive ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
