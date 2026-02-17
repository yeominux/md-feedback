import { CSSProperties } from "react";

// VS Code dark theme colors
export const colors = {
  bg: "#1e1e1e",
  sidebar: "#252526",
  sidebarBorder: "#3c3c3c",
  text: "#d4d4d4",
  textMuted: "#858585",
  heading: "#e0e0e0",
  accent: "#007acc",
  // Memo colors
  fixRed: "#dc2626",
  fixRedBg: "rgba(220, 38, 38, 0.15)",
  fixRedLight: "#fca5a5",
  questionBlue: "#2563eb",
  highlightYellow: "#d97706",
  // Status badges
  statusOpen: "#6b7280",
  statusWorking: "#3b82f6",
  statusDone: "#22c55e",
  // Gate
  gateBlocked: "#ef4444",
  gateApproved: "#22c55e",
  // Diff
  diffRemoveBg: "rgba(220, 38, 38, 0.2)",
  diffAddBg: "rgba(34, 197, 94, 0.2)",
  diffRemoveText: "#fca5a5",
  diffAddText: "#86efac",
  // Card
  cardBg: "#2d2d2d",
  cardBorder: "#404040",
};

export const container: CSSProperties = {
  width: "100%",
  height: "100%",
  backgroundColor: colors.bg,
  display: "flex",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  color: colors.text,
  overflow: "hidden",
};

export const sidebarPanel: CSSProperties = {
  width: 320,
  backgroundColor: colors.sidebar,
  borderRight: `1px solid ${colors.sidebarBorder}`,
  display: "flex",
  flexDirection: "column",
  padding: 16,
  overflow: "hidden",
};

export const editorPanel: CSSProperties = {
  flex: 1,
  padding: "24px 32px",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};
