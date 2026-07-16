import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { cardStyle, colors, errorBannerStyle, fontFamily, h1Style, inputStyle, labelStyle, primaryButtonStyle } from "../theme";

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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: colors.page, fontFamily, padding: "1.5rem" }}>
      <div style={{ ...cardStyle, maxWidth: 420, width: "100%" }}>
        <h1 style={h1Style}>Change your password</h1>
        <p style={{ color: colors.textMuted, fontSize: "0.85rem", margin: "0 0 1.5rem", lineHeight: 1.5 }}>
          Password must be at least 8 characters and include an uppercase letter, lowercase letter, number, and special character.
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={labelStyle}>Current / temporary password</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={labelStyle}>New password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required style={inputStyle} />
          </div>
          {error && <div style={errorBannerStyle}>{error}</div>}
          <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, width: "100%", opacity: submitting ? 0.7 : 1 }}>
            {submitting ? "Saving..." : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
