import type { CSSProperties } from "react";

/**
 * Single source of truth for the app's color theme, shared by every page and
 * by Login.tsx's inline <style> block (kept in sync manually there, since
 * that page renders outside Layout.tsx and uses a plain CSS string instead
 * of inline style objects). Change a value here to re-theme the whole app.
 */
export const colors = {
  // Brand / hero gradient (matches Login.tsx)
  brandDark: "#0b1220",
  brandDarker: "#0f172a",
  brandMid: "#0f2540",
  brandDeep: "#0c4a6e",
  accent: "#38bdf8", // sky-400 - links, focus rings, highlights
  accentSoft: "rgba(56, 189, 248, 0.14)",
  accentBorder: "rgba(56, 189, 248, 0.28)",
  indigo: "#6366f1",

  // Surfaces
  page: "#f8fafc",
  surface: "#ffffff",
  surfaceMuted: "#f9fafb",
  border: "#e2e8f0",
  borderSoft: "#eef2f7",
  borderStrong: "#cbd5e1",

  // Text
  textPrimary: "#0f172a",
  textSecondary: "#334155",
  textMuted: "#64748b",
  textFaint: "#94a3b8",
  textOnDark: "#f1f5f9",

  // Status
  success: "#16a34a",
  successBg: "#f0fdf4",
  successBorder: "#bbf7d0",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
  dangerBorder: "#fecaca",
  warning: "#d97706",
  warningBg: "#fffbeb",
  warningBorder: "#fde68a",
} as const;

export const gradients = {
  sidebar: `linear-gradient(180deg, ${colors.brandDarker} 0%, ${colors.brandMid} 100%)`,
  button: `linear-gradient(135deg, ${colors.brandDarker}, #164e73)`,
  hero: `linear-gradient(135deg, ${colors.brandDark} 0%, ${colors.brandMid} 50%, ${colors.brandDeep} 100%)`,
};

export const shadow = {
  card: "0 1px 2px rgba(15,23,42,0.04), 0 12px 28px -10px rgba(15,23,42,0.10)",
  raised: "0 1px 2px rgba(15,23,42,0.04), 0 24px 48px -14px rgba(15,23,42,0.14)",
};

export const fontFamily = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// ---- Shared style objects, reused across pages instead of re-declaring
// the same hex codes/borders everywhere. ----

export const pageStyle: CSSProperties = {
  fontFamily,
};

export const h1Style: CSSProperties = {
  fontSize: "1.5rem",
  fontWeight: 700,
  color: colors.textPrimary,
  margin: "0 0 0.35rem",
  letterSpacing: "-0.01em",
};

export const subheadStyle: CSSProperties = {
  fontSize: "0.9rem",
  color: colors.textMuted,
  margin: "0 0 1.5rem",
};

export const cardStyle: CSSProperties = {
  background: colors.surface,
  border: `1px solid ${colors.borderSoft}`,
  borderRadius: 12,
  padding: "1.25rem 1.5rem",
  boxShadow: shadow.card,
};

export const formRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.85rem",
  marginBottom: "1.5rem",
  alignItems: "end",
  flexWrap: "wrap",
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: colors.textSecondary,
  marginBottom: "0.35rem",
};

export const inputStyle: CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: "0.55rem 0.75rem",
  fontSize: "0.9rem",
  fontFamily,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: 8,
  outline: "none",
  background: colors.surfaceMuted,
};

export const primaryButtonStyle: CSSProperties = {
  padding: "0.6rem 1.1rem",
  background: gradients.button,
  color: "white",
  border: "none",
  borderRadius: 8,
  fontSize: "0.88rem",
  fontWeight: 600,
  fontFamily,
  cursor: "pointer",
};

export const secondaryButtonStyle: CSSProperties = {
  padding: "0.5rem 0.9rem",
  background: colors.surface,
  color: colors.textSecondary,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: 8,
  fontSize: "0.85rem",
  fontWeight: 600,
  fontFamily,
  cursor: "pointer",
};

export const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.9rem",
};

export const thStyle: CSSProperties = {
  textAlign: "left",
  borderBottom: `1px solid ${colors.borderStrong}`,
  padding: "0.6rem 0.5rem",
  fontSize: "0.75rem",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: colors.textFaint,
  fontWeight: 600,
};

export const tdStyle: CSSProperties = {
  padding: "0.65rem 0.5rem",
  borderBottom: `1px solid ${colors.border}`,
  color: colors.textSecondary,
};

export const errorBannerStyle: CSSProperties = {
  background: colors.dangerBg,
  border: `1px solid ${colors.dangerBorder}`,
  color: "#b91c1c",
  fontSize: "0.85rem",
  padding: "0.65rem 0.85rem",
  borderRadius: 8,
  marginBottom: "1rem",
};

export const successBannerStyle: CSSProperties = {
  background: colors.successBg,
  border: `1px solid ${colors.successBorder}`,
  color: "#15803d",
  fontSize: "0.85rem",
  padding: "0.65rem 0.85rem",
  borderRadius: 8,
  marginBottom: "1rem",
};

/** Small rounded status pill, colored by a coarse "kind" bucket. */
export function badgeStyle(kind: "success" | "warning" | "danger" | "neutral"): CSSProperties {
  const map: Record<typeof kind, { bg: string; border: string; text: string }> = {
    success: { bg: colors.successBg, border: colors.successBorder, text: "#15803d" },
    warning: { bg: colors.warningBg, border: colors.warningBorder, text: "#b45309" },
    danger: { bg: colors.dangerBg, border: colors.dangerBorder, text: "#b91c1c" },
    neutral: { bg: colors.surfaceMuted, border: colors.border, text: colors.textMuted },
  };
  const c = map[kind];
  return {
    display: "inline-block",
    padding: "0.15rem 0.55rem",
    borderRadius: 999,
    fontSize: "0.72rem",
    fontWeight: 600,
    background: c.bg,
    border: `1px solid ${c.border}`,
    color: c.text,
    textTransform: "capitalize",
  };
}
