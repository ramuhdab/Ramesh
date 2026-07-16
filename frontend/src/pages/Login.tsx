import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";

const ICON_PROPS = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const FEATURES = [
  {
    title: "Employee & Uniform Lifecycle",
    desc: "Onboard staff, issue uniforms and PPE, and track every handover from day one to exit.",
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="8" r="3.6" />
        <path d="M4.5 20c0-4.2 3.4-7.2 7.5-7.2s7.5 3 7.5 7.2" />
      </svg>
    ),
  },
  {
    title: "Real-Time Inventory Control",
    desc: "Live stock levels across categories, locations, and vendors — no more spreadsheet guesswork.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3.5 7.2L12 3.5l8.5 3.7-8.5 3.7-8.5-3.7z" />
        <path d="M3.5 7.2v9.6L12 20.5l8.5-3.7V7.2" />
        <path d="M12 10.9v9.6" />
      </svg>
    ),
  },
  {
    title: "Procurement & Approvals",
    desc: "Multi-level approval workflows for purchase indents, vendor orders, and budget sign-off.",
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="9.5" cy="20" r="1" fill="currentColor" stroke="none" />
        <circle cx="17.5" cy="20" r="1" fill="currentColor" stroke="none" />
        <path d="M2.5 3.5h2l2.3 11.4a2 2 0 002 1.6h8a2 2 0 002-1.7L20.5 7.5H6" />
      </svg>
    ),
  },
  {
    title: "Role-Based Access & Audit",
    desc: "Granular permissions per role, with a full audit trail on every action across your organization.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M12 3l7.5 3v5.6c0 4.6-3.1 8.2-7.5 9.4-4.4-1.2-7.5-4.8-7.5-9.4V6l7.5-3z" />
        <path d="M9 12.2l2.1 2.1 4-4" />
      </svg>
    ),
  },
];

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
    <div className="spqr-landing">
      <style>{`
        .spqr-landing {
          min-height: 100vh;
          display: flex;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #f8fafc;
        }
        .spqr-landing__hero {
          flex: 1.15;
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, #0b1220 0%, #0f2540 50%, #0c4a6e 100%);
          color: #f8fafc;
          padding: 4rem 4.5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .spqr-landing__hero::before,
        .spqr-landing__hero::after {
          content: "";
          position: absolute;
          border-radius: 50%;
          filter: blur(70px);
          opacity: 0.32;
          pointer-events: none;
        }
        .spqr-landing__hero::before {
          width: 440px;
          height: 440px;
          background: #38bdf8;
          top: -150px;
          right: -130px;
        }
        .spqr-landing__hero::after {
          width: 340px;
          height: 340px;
          background: #6366f1;
          bottom: -110px;
          left: -90px;
        }
        .spqr-landing__badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          width: fit-content;
          padding: 0.4rem 0.9rem;
          border-radius: 999px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.16);
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #7dd3fc;
          position: relative;
          z-index: 1;
          margin-bottom: 1.75rem;
        }
        .spqr-landing__title {
          position: relative;
          z-index: 1;
          font-size: 2.65rem;
          line-height: 1.14;
          font-weight: 800;
          max-width: 540px;
          margin: 0 0 1rem;
          letter-spacing: -0.02em;
        }
        .spqr-landing__subtitle {
          position: relative;
          z-index: 1;
          font-size: 1.05rem;
          line-height: 1.65;
          color: #b9c6d9;
          max-width: 480px;
          margin: 0 0 3rem;
        }
        .spqr-landing__features {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.75rem 2.25rem;
          max-width: 560px;
        }
        .spqr-landing__feature-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(56, 189, 248, 0.14);
          border: 1px solid rgba(56, 189, 248, 0.28);
          color: #7dd3fc;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 0.7rem;
        }
        .spqr-landing__feature h3 {
          font-size: 0.95rem;
          margin: 0 0 0.3rem;
          font-weight: 600;
          color: #f1f5f9;
        }
        .spqr-landing__feature p {
          font-size: 0.82rem;
          line-height: 1.55;
          color: #94a3b8;
          margin: 0;
        }
        .spqr-landing__form-side {
          flex: 0.85;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2.5rem;
        }
        .spqr-landing__card {
          width: 100%;
          max-width: 380px;
          background: #ffffff;
          border-radius: 16px;
          padding: 2.75rem 2.5rem;
          box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 24px 48px -14px rgba(15,23,42,0.14);
          border: 1px solid #eef2f7;
        }
        .spqr-landing__card h1 {
          font-size: 1.4rem;
          font-weight: 700;
          margin: 0 0 0.35rem;
          color: #0f172a;
        }
        .spqr-landing__card p.subhead {
          font-size: 0.88rem;
          color: #64748b;
          margin: 0 0 1.85rem;
        }
        .spqr-field {
          margin-bottom: 1.15rem;
        }
        .spqr-field label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: #334155;
          margin-bottom: 0.4rem;
        }
        .spqr-field input {
          width: 100%;
          box-sizing: border-box;
          padding: 0.68rem 0.85rem;
          font-size: 0.92rem;
          font-family: inherit;
          border: 1px solid #dbe1ea;
          border-radius: 8px;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
          background: #f9fafb;
        }
        .spqr-field input:focus {
          border-color: #38bdf8;
          box-shadow: 0 0 0 3px rgba(56,189,248,0.15);
          background: #ffffff;
        }
        .spqr-landing__submit {
          width: 100%;
          padding: 0.78rem;
          margin-top: 0.35rem;
          background: linear-gradient(135deg, #0f172a, #164e73);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.92rem;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: opacity 0.15s ease, transform 0.15s ease;
        }
        .spqr-landing__submit:hover:not(:disabled) {
          opacity: 0.92;
          transform: translateY(-1px);
        }
        .spqr-landing__submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .spqr-landing__error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
          font-size: 0.82rem;
          padding: 0.6rem 0.75rem;
          border-radius: 8px;
          margin-bottom: 1rem;
        }
        .spqr-landing__footer-note {
          margin-top: 1.75rem;
          text-align: center;
          font-size: 0.76rem;
          color: #94a3b8;
        }
        .spqr-landing__hero-footer {
          position: relative;
          z-index: 1;
          margin-top: 3rem;
          font-size: 0.78rem;
          color: #7f93ab;
        }
        @media (max-width: 900px) {
          .spqr-landing__hero { display: none; }
          .spqr-landing__form-side { flex: 1; }
        }
      `}</style>

      <div className="spqr-landing__hero">
        <span className="spqr-landing__badge">Sparquer &middot; Facilities Platform</span>
        <h1 className="spqr-landing__title">SPQR Inventory Management</h1>
        <p className="spqr-landing__subtitle">
          One platform to run employee uniforms, PPE issuance, vendor procurement, and inventory
          operations across every organization you manage — built for facilities teams that need
          control and visibility at scale.
        </p>
        <div className="spqr-landing__features">
          {FEATURES.map((f) => (
            <div className="spqr-landing__feature" key={f.title}>
              <div className="spqr-landing__feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
        <p className="spqr-landing__hero-footer">Trusted by facilities & operations teams to run inventory that keeps the business moving.</p>
      </div>

      <div className="spqr-landing__form-side">
        <div className="spqr-landing__card">
          <h1>Welcome back</h1>
          <p className="subhead">Sign in to your SPQR Inventory Management account</p>
          <form onSubmit={handleSubmit}>
            <div className="spqr-field">
              <label htmlFor="username">Username</label>
              <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus autoComplete="username" />
            </div>
            <div className="spqr-field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            {error && <div className="spqr-landing__error">{error}</div>}
            <button type="submit" className="spqr-landing__submit" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <p className="spqr-landing__footer-note">Secure, role-based access &middot; Every action is audited</p>
        </div>
      </div>
    </div>
  );
}
