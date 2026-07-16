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
  secondaryButtonStyle,
  subheadStyle,
  successBannerStyle,
  tableStyle,
  tdStyle,
  thStyle,
} from "../theme";

// The backend's Vendor model (schema.prisma) only has a top-level `name` -
// every other field from the requirements doc (GST No, addresses, company
// registration date, representative contact) is intentionally free-form,
// stored in the existing `documents` JSON column, the same pattern already
// used for Organization.contactInfo elsewhere in this codebase. Actual file
// uploads (approval documents) go through the separate Attachments module
// against entityType "vendor" - this form only captures the profile data.
type VendorDocuments = {
  companyName?: string;
  gstNumber?: string;
  currentAddress?: string;
  previousAddress?: string;
  companyRegisteredDate?: string;
  phone?: string;
  email?: string;
  representativeName?: string;
  representativePhone?: string;
  representativeEmail?: string;
};

type Vendor = {
  id: string;
  name: string;
  documents: VendorDocuments | null;
  status: "pending" | "verified" | "approved" | string;
  performanceScore: number | null;
  isActive: boolean;
};

const FIELDS: { key: keyof VendorDocuments; label: string; type?: string }[] = [
  { key: "companyName", label: "Vendor Company Name" },
  { key: "gstNumber", label: "GST No." },
  { key: "phone", label: "Vendor Phone No." },
  { key: "email", label: "Vendor Email", type: "email" },
  { key: "currentAddress", label: "Current Address" },
  { key: "previousAddress", label: "Previous Address (if any)" },
  { key: "companyRegisteredDate", label: "Company Registered Date", type: "date" },
  { key: "representativeName", label: "Representative Name" },
  { key: "representativePhone", label: "Representative Phone" },
  { key: "representativeEmail", label: "Representative Email", type: "email" },
];

function statusBadgeKind(status: string): "success" | "warning" | "neutral" {
  if (status === "approved") return "success";
  if (status === "verified" || status === "pending") return "warning";
  return "neutral";
}

// Vendor Management module - WF15 Vendor Approval (create -> Finance
// verification -> management approval, mirrors the same two-step pattern
// as the 4-level procurement chain but scoped to just Finance + one final
// approver) and WF16 Vendor Performance (rolling delivery/quality/price score).
export function Vendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [name, setName] = useState("");
  const [docFields, setDocFields] = useState<VendorDocuments>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setVendors(await api.get<Vendor[]>("/vendors"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load vendors.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function setField(key: keyof VendorDocuments, value: string) {
    setDocFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const documents = Object.fromEntries(Object.entries(docFields).filter(([, v]) => v));
      await api.post("/vendors", { name, documents: Object.keys(documents).length ? documents : undefined });
      setMessage(`Vendor "${name}" added - pending Finance verification.`);
      setName("");
      setDocFields({});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create vendor.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(vendor: Vendor) {
    setError(null);
    setMessage(null);
    setBusyId(vendor.id);
    try {
      await api.post(`/vendors/${vendor.id}/verify`);
      setMessage(`"${vendor.name}" Finance-verified - awaiting management approval.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to verify vendor.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleApprove(vendor: Vendor) {
    setError(null);
    setMessage(null);
    setBusyId(vendor.id);
    try {
      await api.post(`/vendors/${vendor.id}/approve`);
      setMessage(`"${vendor.name}" approved - usable in procurement.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve vendor.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 style={h1Style}>Vendors</h1>
      <p style={subheadStyle}>Approved vendors are required before a procurement request can reference them (WF15).</p>

      <form onSubmit={handleCreate} style={{ ...formRowStyle, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", width: "100%" }}>
          <div style={formRowStyle}>
            <label>
              <span style={labelStyle}>Vendor Name *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required style={{ ...inputStyle, width: 240 }} />
            </label>
            {FIELDS.slice(0, 2).map((f) => (
              <label key={f.key}>
                <span style={labelStyle}>{f.label}</span>
                <input type={f.type ?? "text"} value={docFields[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} style={{ ...inputStyle, width: 200 }} />
              </label>
            ))}
          </div>
          <div style={formRowStyle}>
            {FIELDS.slice(2).map((f) => (
              <label key={f.key}>
                <span style={labelStyle}>{f.label}</span>
                <input type={f.type ?? "text"} value={docFields[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} style={{ ...inputStyle, width: 200 }} />
              </label>
            ))}
          </div>
          <div>
            <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
              {submitting ? "Adding..." : "Add vendor"}
            </button>
          </div>
        </div>
      </form>

      {error && <div style={errorBannerStyle}>{error}</div>}
      {message && <div style={successBannerStyle}>{message}</div>}

      {loading ? (
        <p style={subheadStyle}>Loading...</p>
      ) : vendors.length === 0 ? (
        <p style={subheadStyle}>No vendors yet - add one above.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>GST No.</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Performance</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <Fragment key={v.id}>
                <tr>
                  <td style={tdStyle}>
                    <button
                      onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                      style={{ background: "none", border: "none", color: colors.textSecondary, cursor: "pointer", padding: 0, font: "inherit", textAlign: "left" }}
                    >
                      {v.name} {expandedId === v.id ? "▲" : "▼"}
                    </button>
                  </td>
                  <td style={tdStyle}>{v.documents?.gstNumber ?? "-"}</td>
                  <td style={tdStyle}>
                    <span style={badgeStyle(statusBadgeKind(v.status))}>{v.status}</span>
                  </td>
                  <td style={tdStyle}>{v.performanceScore != null ? `${v.performanceScore}/100` : "Not rated"}</td>
                  <td style={tdStyle}>
                    {v.status === "pending" && (
                      <button onClick={() => handleVerify(v)} disabled={busyId === v.id} style={secondaryButtonStyle}>
                        {busyId === v.id ? "..." : "Verify (Finance)"}
                      </button>
                    )}
                    {v.status === "verified" && (
                      <button onClick={() => handleApprove(v)} disabled={busyId === v.id} style={secondaryButtonStyle}>
                        {busyId === v.id ? "..." : "Approve"}
                      </button>
                    )}
                  </td>
                </tr>
                {expandedId === v.id && (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, background: colors.surfaceMuted }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 2rem", fontSize: "0.82rem", color: colors.textMuted, padding: "0.5rem 0" }}>
                        {FIELDS.map((f) => (
                          <div key={f.key}>
                            <strong style={{ color: colors.textSecondary }}>{f.label}:</strong> {v.documents?.[f.key] || "-"}
                          </div>
                        ))}
                      </div>
                      <div style={{ paddingTop: "0.5rem", borderTop: `1px solid ${colors.border}`, marginTop: "0.25rem" }}>
                        <AttachmentsPanel entityType="vendor" entityId={v.id} />
                      </div>
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
