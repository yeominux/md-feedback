import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { MockEditor } from "./components/MockEditor";
import { MemoCard } from "./components/MemoCard";
import { StatusBar } from "./components/StatusBar";
import { GateBadge } from "./components/GateBadge";
import { colors, container, sidebarPanel } from "./styles";

/**
 * MD Feedback v1.3.1 Demo — 15s at 30 FPS (450 frames)
 *
 * Story: Human annotates → AI implements → Human reviews in editor (CodeLens) → Approved → Gate passes
 *
 * Timeline (generous pacing — each step breathes):
 *   0-2s    (0-60):    Title card
 *   2-4s    (60-120):  Editor content + Fix annotation appears
 *   4-6s    (120-180): AI working → diff slides in
 *   6-8s    (180-240): Status → Review, CodeLens Approve/Reject appears
 *   8-10s   (240-300): Human clicks Approve → Done
 *   10-12s  (300-360): Gate: Blocked → Approved
 *   12-15s  (360-450): End card with install CTA
 */
export const DemoComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /* ─── Title overlay ─── */
  const titleIn = spring({ frame, fps, config: { damping: 20, stiffness: 60, mass: 1.2 } });
  const titleHold = frame > 50
    ? spring({ frame: frame - 50, fps, config: { damping: 22, stiffness: 100 } })
    : 0;
  const titleOpacity = frame < 50 ? titleIn : Math.max(0, 1 - titleHold);
  const titleY = frame < 50
    ? interpolate(titleIn, [0, 1], [16, 0])
    : interpolate(titleHold, [0, 1], [0, -10]);

  /* ─── AI activity indicator (frame 125-185) ─── */
  const aiIn = frame >= 125
    ? spring({ frame: frame - 125, fps, config: { damping: 18, stiffness: 90 } })
    : 0;
  const aiOut = frame >= 178
    ? spring({ frame: frame - 178, fps, config: { damping: 22, stiffness: 120 } })
    : 0;
  const aiOpacity = Math.max(0, aiIn - aiOut);
  const aiDotScale = frame >= 125 && frame < 185
    ? 1 + 0.25 * Math.sin((frame - 125) * 0.12)
    : 1;

  /* ─── End card (frame 370) ─── */
  const endIn = frame >= 370
    ? spring({ frame: frame - 370, fps, config: { damping: 16, stiffness: 60, mass: 1 } })
    : 0;
  const endY = interpolate(endIn, [0, 1], [24, 0]);

  return (
    <AbsoluteFill>
      <div style={container}>
        {/* ── Sidebar ── */}
        <div style={sidebarPanel}>
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
                borderRadius: 5,
                background: `linear-gradient(135deg, ${colors.accent}, #0098ff)`,
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
            <span
              style={{
                fontSize: 9,
                color: colors.textMuted,
                marginLeft: "auto",
                backgroundColor: colors.cardBg,
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              v1.3
            </span>
          </div>

          <MemoCard />
          <GateBadge />

          {/* AI activity indicator */}
          {aiOpacity > 0.01 && (
            <div
              style={{
                opacity: aiOpacity,
                transform: `translateY(${interpolate(aiIn, [0, 1], [8, 0])}px)`,
                marginTop: 16,
                padding: "8px 10px",
                backgroundColor: "rgba(59, 130, 246, 0.1)",
                border: `1px solid rgba(59, 130, 246, 0.2)`,
                borderRadius: 8,
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
                  transform: `scale(${aiDotScale})`,
                }}
              />
              AI applying fix via MCP...
            </div>
          )}
        </div>

        {/* ── Editor ── */}
        <MockEditor />

        {/* ── Status bar ── */}
        <StatusBar />
      </div>

      {/* ── Title overlay ── */}
      {titleOpacity > 0.01 && (
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
            backgroundColor: `rgba(14, 14, 14, ${titleOpacity * 0.92})`,
            zIndex: 10,
          }}
        >
          <div
            style={{
              textAlign: "center",
              opacity: titleOpacity,
              transform: `translateY(${titleY}px)`,
            }}
          >
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: "white",
                marginBottom: 12,
                letterSpacing: -0.6,
              }}
            >
              MD Feedback
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#888",
                letterSpacing: 0.2,
                lineHeight: 1.6,
              }}
            >
              Review your plan. AI builds it. You approve.
            </div>
          </div>
        </div>
      )}

      {/* ── End card ── */}
      {endIn > 0.01 && (
        <div
          style={{
            position: "absolute",
            bottom: 44,
            right: 20,
            opacity: endIn,
            transform: `translateY(${endY}px)`,
            background: `linear-gradient(135deg, ${colors.accent}, #0098ff)`,
            padding: "10px 20px",
            borderRadius: 10,
            zIndex: 10,
            boxShadow: "0 4px 24px rgba(0, 122, 204, 0.35)",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: "white", letterSpacing: 0.2 }}>
            Install → VS Code Marketplace → "MD Feedback"
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};
