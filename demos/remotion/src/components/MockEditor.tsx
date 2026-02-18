import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, editorPanel } from "../styles";

/**
 * VS Code editor panel — markdown content with annotation + inline diff
 *
 * Timeline:
 *   frame 55:  content fades in
 *   frame 75:  fix annotation highlight appears
 *   frame 130: inline diff slides in
 *   frame 190: CodeLens Approve/Reject appears
 */
export const MockEditor: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /* ─── Content entrance ─── */
  const contentIn = frame >= 55
    ? spring({ frame: frame - 55, fps, config: { damping: 20, stiffness: 60 } })
    : 0;

  /* ─── Fix annotation highlight (frame 75) ─── */
  const highlightIn = frame >= 75
    ? spring({ frame: frame - 75, fps, config: { damping: 14, stiffness: 100, mass: 0.7 } })
    : 0;

  /* ─── Diff section (frame 130) ─── */
  const diffIn = frame >= 130
    ? spring({ frame: frame - 130, fps, config: { damping: 16, stiffness: 70 } })
    : 0;
  const diffY = interpolate(diffIn, [0, 1], [12, 0]);

  /* ─── CodeLens actions (frame 190) ─── */
  const lensIn = frame >= 190
    ? spring({ frame: frame - 190, fps, config: { damping: 14, stiffness: 90 } })
    : 0;
  const lensOut = frame >= 250
    ? spring({ frame: frame - 250, fps, config: { damping: 20, stiffness: 140 } })
    : 0;
  const lensOpacity = Math.max(0, lensIn - lensOut);
  const lensY = interpolate(lensIn, [0, 1], [8, 0]);
  const approveHover = frame >= 232 && frame < 248;

  // Line numbers for realism
  const lineNum = (n: number, opacity = 1) => (
    <span
      style={{
        display: "inline-block",
        width: 28,
        textAlign: "right",
        marginRight: 16,
        color: colors.textMuted,
        fontSize: 11,
        opacity: opacity * 0.5,
        userSelect: "none",
      }}
    >
      {n}
    </span>
  );

  return (
    <div style={editorPanel}>
      {/* File tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          marginBottom: 20,
          borderBottom: `1px solid ${colors.sidebarBorder}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderBottom: `2px solid ${colors.accent}`,
            marginBottom: -1,
          }}
        >
          <span style={{ color: colors.accent, fontSize: 11 }}>M↓</span>
          <span style={{ color: colors.text, fontSize: 12 }}>
            implementation-plan.md
          </span>
        </div>
        <span
          style={{
            color: colors.textMuted,
            fontSize: 10,
            marginLeft: "auto",
            padding: "0 8px",
          }}
        >
          UTF-8 · Markdown
        </span>
      </div>

      {/* Markdown content */}
      <div style={{ fontSize: 13, lineHeight: 2, opacity: contentIn }}>
        {/* Line 1: heading */}
        <div style={{ marginBottom: 4 }}>
          {lineNum(1)}
          <span style={{ color: "#569cd6", fontWeight: 600 }}>#</span>
          <span style={{ color: colors.heading, fontSize: 17, fontWeight: 600, marginLeft: 6 }}>
            Authentication Module
          </span>
        </div>

        {/* Line 2: blank */}
        <div style={{ marginBottom: 4 }}>{lineNum(2, 0)}</div>

        {/* Line 3-4: content */}
        <div style={{ marginBottom: 4 }}>
          {lineNum(3)}
          <span style={{ color: colors.text }}>
            Store session tokens in localStorage for persistence
          </span>
        </div>
        <div style={{ marginBottom: 4 }}>
          {lineNum(4)}
          <span style={{ color: colors.text }}>across browser refreshes.</span>
        </div>

        {/* Line 5: blank */}
        <div style={{ marginBottom: 4 }}>{lineNum(5, 0)}</div>

        {/* Line 6: annotated line */}
        <div style={{ marginBottom: 4, position: "relative" }}>
          {lineNum(6)}
          <span
            style={{
              backgroundColor: interpolate(highlightIn, [0, 1], [0, 1]) > 0
                ? `rgba(220, 38, 38, ${0.15 * highlightIn})`
                : "transparent",
              borderBottom: highlightIn > 0.5
                ? `2px solid rgba(220, 38, 38, ${highlightIn})`
                : "none",
              padding: "1px 3px",
              borderRadius: 3,
            }}
          >
            <span style={{ color: colors.text }}>Use httpOnly cookies instead of localStorage</span>
          </span>

          {/* FIX badge */}
          {highlightIn > 0.01 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                marginLeft: 8,
                backgroundColor: colors.fixRed,
                color: "white",
                fontSize: 9,
                fontWeight: 700,
                padding: "1px 7px",
                borderRadius: 10,
                opacity: highlightIn,
                transform: `scale(${interpolate(highlightIn, [0, 0.5, 1], [0.8, 1.05, 1])})`,
                letterSpacing: 0.5,
              }}
            >
              FIX
            </span>
          )}
        </div>

        {/* CodeLens review actions (editor-first approve flow) */}
        {lensOpacity > 0.01 && (
          <div
            style={{
              margin: "2px 0 8px 44px",
              opacity: lensOpacity,
              transform: `translateY(${lensY}px)`,
              fontSize: 10,
              color: colors.textMuted,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ color: "rgba(212,212,212,0.55)" }}>CodeLens:</span>
            <span
              style={{
                color: approveHover ? colors.approveGreen : "rgba(134,239,172,0.95)",
                fontWeight: 600,
              }}
            >
              $(check) Approve
            </span>
            <span style={{ color: "rgba(212,212,212,0.45)" }}>|</span>
            <span style={{ color: "rgba(252,165,165,0.95)" }}>$(x) Reject</span>
          </div>
        )}

        {/* Inline diff — appears at frame 130 */}
        {diffIn > 0.01 && (
          <div
            style={{
              opacity: diffIn,
              transform: `translateY(${diffY}px)`,
              margin: "8px 0 8px 44px",
              borderRadius: 8,
              border: `1px solid ${colors.cardBorder}`,
              overflow: "hidden",
              fontSize: 11,
              fontFamily: "'Fira Code', 'Cascadia Code', monospace",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "4px 10px",
                backgroundColor: "rgba(255,255,255,0.03)",
                borderBottom: `1px solid ${colors.cardBorder}`,
                fontSize: 10,
                color: colors.textMuted,
              }}
            >
              AI applied change
            </div>
            <div
              style={{
                backgroundColor: colors.diffRemoveBg,
                padding: "5px 12px",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
              }}
            >
              <span style={{ color: colors.fixRedLight, marginRight: 8 }}>−</span>
              <span style={{ color: colors.diffRemoveText }}>
                Store session tokens in{" "}
              </span>
              <span
                style={{
                  color: colors.diffRemoveText,
                  textDecoration: "line-through",
                  textDecorationColor: "rgba(220,38,38,0.6)",
                }}
              >
                localStorage
              </span>
            </div>
            <div
              style={{
                backgroundColor: colors.diffAddBg,
                padding: "5px 12px",
              }}
            >
              <span style={{ color: colors.diffAddText, marginRight: 8 }}>+</span>
              <span style={{ color: colors.diffAddText }}>
                Store session tokens in{" "}
              </span>
              <span style={{ color: colors.diffAddText, fontWeight: 600 }}>
                httpOnly secure cookies
              </span>
            </div>
          </div>
        )}

        {/* Line 7: more content */}
        <div style={{ marginBottom: 4 }}>{lineNum(7, 0)}</div>
        <div style={{ marginBottom: 4 }}>
          {lineNum(8)}
          <span style={{ color: colors.text }}>
            Add CSRF protection middleware to all API routes.
          </span>
        </div>
      </div>
    </div>
  );
};
