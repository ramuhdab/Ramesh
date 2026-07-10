import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";

// WF2/WF32: users must change a temporary password before continuing.
export function ChangePassword() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 400 }}>
      <h1>Change your password</h1>
      <p style={{ color: "#475569", fontSize: "0.9rem" }}>
        Password must be at least 8 characters and include an uppercase letter, lowercase letter, number, and special character.
      </p>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: "0.75rem" }}>
          Current / temporary password
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }} />
        </label>
        <label style={{ display: "block", marginBottom: "1rem" }}>
          New password
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }} />
        </label>
        {error && <p style={{ color: "#dc2626" }}>{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save"}</button>
      </form>
    </div>
  );
}
