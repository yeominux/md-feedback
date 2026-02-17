import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Sequence } from "remotion";
import { MockEditor } from "./components/MockEditor";
import { MemoCard } from "./components/MemoCard";
import { StatusBar } from "./components/StatusBar";
import { GateBadge } from "./components/GateBadge";
import { colors, container, sidebarPanel } from "./styles";

/**
 * MD Feedback Demo — 10 seconds at 30 FPS (300 frames)
 *
 * Timeline:
 *   0-3s  (0-90):   Markdown + Fix annotation visible
 *   3-5s  (90-150): AI applies fix → inline diff appears
 *   5-7s  (150-210): Status: Open → Done, progress bar updates
 *   7-10s (210-300): Gate: Blocked → Approved
 */
export const DemoComposition: React.FC = () => {
  const frame = useCurrentFrame();

  // Title overlay at the start
  const titleOpacity = interpolate(frame, [0, 15, 45, 60], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "AI applying fix..." indicator
  const aiIndicatorOpacity = interpolate(frame, [85, 95, 145, 155], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // End card
  const endOpacity = interpolate(frame, [260, 280], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <div style={container}>
        {/* Sidebar panel */}
        <div style={sidebarPanel}>
          {/* Sidebar header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
              paddingBottom: 8,
              borderBottom: `1px solid ${colors.sidebarBorder}`,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                backgroundColor: colors.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                color: "white",
              }}
            >
              M
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>
              MD Feedback
            </span>
          </div>

          {/* Memo card */}
          <MemoCard />

          {/* Gate badge */}
          <GateBadge />

          {/* AI activity indicator */}
          {aiIndicatorOpacity > 0 && (
            <div
              style={{
                opacity: aiIndicatorOpacity,
                marginTop: 16,
                padding: "8px 10px",
                backgroundColor: "rgba(59, 130, 246, 0.15)",
                border: `1px solid rgba(59, 130, 246, 0.3)`,
                borderRadius: 6,
                fontSize: 11,
                color: colors.statusWorking,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: colors.statusWorking,
                  animation: "pulse 1s infinite",
                }}
              />
              AI applying fix via MCP...
            </div>
          )}
        </div>

        {/* Editor panel */}
        <MockEditor />

        {/* Status bar */}
        <StatusBar />
      </div>

      {/* Title overlay */}
      {titleOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `rgba(30, 30, 30, ${titleOpacity * 0.85})`,
            zIndex: 10,
          }}
        >
          <div style={{ textAlign: "center", opacity: titleOpacity }}>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "white",
                marginBottom: 8,
              }}
            >
              MD Feedback
            </div>
            <div style={{ fontSize: 14, color: colors.textMuted }}>
              Review your plan. AI builds it.
            </div>
          </div>
        </div>
      )}

      {/* End card */}
      {endOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 36,
            right: 16,
            opacity: endOpacity,
            backgroundColor: "rgba(0, 122, 204, 0.9)",
            padding: "8px 16px",
            borderRadius: 8,
            zIndex: 10,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: "white" }}>
            Install: VS Code Marketplace → "MD Feedback"
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};
