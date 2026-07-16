import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import { colors, fontFamily, shadow } from "../theme";

type NotificationRow = {
  id: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

// Friendly labels mirroring the backend's EVENT_MESSAGES templates
// (notification.service.ts) - the stored Notification row only keeps the
// raw eventType + payload (not a rendered message, which is only ever
// computed for the outbound email), so the bell needs its own small mapping
// to avoid showing raw event-type strings like "procurement.po_issued".
const EVENT_LABELS: Record<string, (payload: any) => string> = {
  "organization.created": (p) => `Organization "${p?.name ?? ""}" created`,
  "organization.activated": () => "Organization activated",
  "user.created": (p) => `Account created for ${p?.email ?? p?.username ?? "a user"}`,
  "user.role_assigned": () => "Role assignment changed",
  "employee.created": (p) => `Employee ${p?.name ?? p?.employeeCode ?? ""} created`,
  "procurement.requested": () => "New procurement request needs approval",
  "procurement.po_issued": () => "Purchase order issued to vendor",
  "procurement.cancelled": (p) => `Procurement cancelled${p?.reason ? `: ${p.reason}` : ""}`,
  "procurement.indent_raised": () => "New indent needs approval",
  "approval.escalated": () => "An approval passed its SLA and was escalated",
  "vendor.approved": () => "A vendor was approved",
  "recovery.calculated": (p) => `Recovery amount calculated: ₹${p?.calculatedAmount ?? ""}`,
  "recovery.finance_verified": () => "A recovery calculation was Finance-verified",
  "inventory.lost_reported": () => "An item was reported lost",
  "inventory.damaged_reported": () => "An item was reported damaged",
  "approval.pending": () => "Something is waiting on your approval",
};

function describe(n: NotificationRow): string {
  const template = EVENT_LABELS[n.eventType];
  if (template) {
    try {
      return template(n.payload ?? {});
    } catch {
      /* fall through to raw type below */
    }
  }
  return n.eventType.replace(/[._]/g, " ");
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      setNotifications(await api.get<NotificationRow[]>("/notifications"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load notifications.");
    }
  }

  useEffect(() => {
    load();
    // Light polling so the badge count stays reasonably fresh without a
    // websocket - 60s is frequent enough for a bell icon, not so frequent it
    // meaningfully adds load.
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function markRead(n: NotificationRow) {
    if (n.readAt) return;
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    try {
      await api.post(`/notifications/${n.id}/read`);
    } catch {
      await load(); // roll back the optimistic update on failure
    }
  }

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.readAt);
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    try {
      await Promise.all(unread.map((n) => api.post(`/notifications/${n.id}/read`)));
    } catch {
      await load();
    }
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div ref={containerRef} style={{ position: "relative", fontFamily }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        style={{
          position: "relative",
          width: 38,
          height: 38,
          borderRadius: 10,
          border: `1px solid ${colors.border}`,
          background: colors.surface,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: colors.textSecondary,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              background: colors.danger,
              color: "white",
              fontSize: "0.68rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 46,
            right: 0,
            width: 340,
            maxHeight: 400,
            overflowY: "auto",
            background: colors.surface,
            border: `1px solid ${colors.borderSoft}`,
            borderRadius: 12,
            boxShadow: shadow.raised,
            zIndex: 50,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.85rem 1rem", borderBottom: `1px solid ${colors.border}` }}>
            <strong style={{ fontSize: "0.9rem", color: colors.textPrimary }}>Notifications</strong>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ background: "none", border: "none", color: colors.accent, fontSize: "0.78rem", cursor: "pointer", fontWeight: 600 }}>
                Mark all read
              </button>
            )}
          </div>

          {error && <div style={{ padding: "0.75rem 1rem", fontSize: "0.8rem", color: colors.danger }}>{error}</div>}

          {notifications.length === 0 ? (
            <div style={{ padding: "1.5rem 1rem", textAlign: "center", fontSize: "0.85rem", color: colors.textFaint }}>No notifications yet.</div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.7rem 1rem",
                  border: "none",
                  borderBottom: `1px solid ${colors.border}`,
                  background: n.readAt ? colors.surface : colors.accentSoft,
                  cursor: n.readAt ? "default" : "pointer",
                  fontFamily,
                }}
              >
                <div style={{ fontSize: "0.83rem", color: colors.textSecondary, marginBottom: "0.2rem" }}>{describe(n)}</div>
                <div style={{ fontSize: "0.72rem", color: colors.textFaint }}>{new Date(n.createdAt).toLocaleString()}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
