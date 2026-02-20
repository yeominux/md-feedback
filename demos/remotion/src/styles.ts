import { CSSProperties } from "react";

// MD Feedback v1.4.0 light theme tokens (aligned with webview/theme/tokens.css)
export const colors = {
  bg: "#f7f7f5",
  surface: "#ffffff",
  border: "rgba(55, 53, 47, 0.09)",
  borderSubtle: "rgba(55, 53, 47, 0.04)",
  text: "#37352f",
  textMuted: "#787774",
  textFaint: "#8a8a86",
  heading: "#2d2a26",
  link: "#2383e2",
  progressTrack: "rgba(55, 53, 47, 0.06)",
  progressFill: "#059669",
  hover: "#f1f1ef",
  fixRed: "#dc2626",
  fixRedBg: "rgba(220, 38, 38, 0.15)",
  fixRedLight: "#b42318",
  questionBlue: "#2563eb",
  highlightYellow: "#d97706",
  // Pill badge backgrounds (v1.3.17+)
  fixPillBg: "rgba(220, 38, 38, 0.12)",
  questionPillBg: "rgba(37, 99, 235, 0.12)",
  highlightPillBg: "rgba(217, 119, 6, 0.12)",
  statusOpen: "#b45309",
  statusWorking: "#3b82f6",
  statusReview: "#6366f1",
  statusDone: "#047857",
  // Gate pill colors (v1.3.18+)
  gateDoneBg: "rgba(4, 120, 87, 0.12)",
  gateDoneText: "#047857",
  gateBlockedBg: "rgba(220, 38, 38, 0.12)",
  gateBlockedText: "#dc2626",
  gateProceedBg: "rgba(37, 99, 235, 0.12)",
  gateProceedText: "#2563eb",
  diffRemoveBg: "#fef2f2",
  diffAddBg: "#ecfdf5",
  diffRemoveText: "#dc2626",
  diffAddText: "#059669",
  cardBg: "#ffffff",
  cardBorder: "rgba(55, 53, 47, 0.09)",
  approveGreen: "#10b981",
  rejectAmber: "#f59e0b",
  shadowSm: "0 1px 3px rgba(0, 0, 0, 0.04)",
  shadowMd: "0 4px 12px rgba(0, 0, 0, 0.08)",
};

export const radii = {
  sm: 4,   // paper, cards
  md: 8,   // pills, badges
  lg: 12,  // modals, drawers
};

export const container: CSSProperties = {
  width: "100%",
  height: "100%",
  backgroundColor: colors.bg,
  display: "block",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  color: colors.text,
  overflow: "hidden",
};

export const editorPanel: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  backgroundColor: colors.bg,
  overflow: "hidden",
};
