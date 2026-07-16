import { useEffect, useRef, useState } from "react";
import { api, ApiError, fetchBlob } from "../api/client";
import { colors, errorBannerStyle, secondaryButtonStyle, subheadStyle } from "../theme";

type Attachment = {
  id: string;
  fileName: string;
  mimeType: string | null;
  uploadedAt: string;
  virusScanStatus: string;
};

/**
 * Generic Attachments module (FR-33/WF30) - "should be able to attach
 * multiple attachments if required" appears on nearly every screen in the
 * requirements doc (employee creation, users, vendors, stock items). Rather
 * than build a one-off uploader per screen, this single component is dropped
 * into any of them with an entityType/entityId pair - matching the backend's
 * deliberately generic, entity-scoped attachment API.
 */
export function AttachmentsPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await api.get<Attachment[]>(`/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`);
      setAttachments(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load attachments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      // Sequential, not Promise.all - keeps upload order predictable and
      // avoids hammering the 10MB-per-file memory-buffered endpoint with a
      // burst of large concurrent uploads (attachment.routes.ts multer config).
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("entityType", entityType);
        formData.append("entityId", entityId);
        await api.upload("/attachments", formData);
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleOpen(att: Attachment) {
    setError(null);
    try {
      const { blob } = await fetchBlob(`/attachments/${att.id}`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to open attachment.");
    }
  }

  async function handleDelete(att: Attachment) {
    setError(null);
    try {
      await api.delete(`/attachments/${att.id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete attachment.");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <label style={{ ...secondaryButtonStyle, display: "inline-block", cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.6 : 1 }}>
          {uploading ? "Uploading..." : "Attach file(s)"}
          <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} disabled={uploading} style={{ display: "none" }} />
        </label>
        {!loading && <span style={{ fontSize: "0.8rem", color: colors.textFaint }}>{attachments.length} attached</span>}
      </div>

      {error && <div style={errorBannerStyle}>{error}</div>}

      {loading ? (
        <p style={subheadStyle}>Loading attachments...</p>
      ) : attachments.length === 0 ? (
        <p style={{ ...subheadStyle, margin: 0 }}>No attachments yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {attachments.map((att) => (
            <li key={att.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.85rem", color: colors.textSecondary }}>
              <button onClick={() => handleOpen(att)} style={{ background: "none", border: "none", color: colors.accent, textDecoration: "underline", cursor: "pointer", padding: 0, font: "inherit" }}>
                {att.fileName}
              </button>
              <span style={{ fontSize: "0.75rem", color: colors.textFaint }}>{new Date(att.uploadedAt).toLocaleDateString()}</span>
              <button onClick={() => handleDelete(att)} style={{ background: "none", border: "none", color: colors.danger, cursor: "pointer", fontSize: "0.78rem", marginLeft: "auto" }}>
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
