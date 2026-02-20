import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, radii } from "../styles";

/**
 * DrawerPreview — v1.4.0 MetadataDrawer progress section
 *
 * Slides in from the right at a given start frame,
 * shows: large "100%" + green progress bar + phase/gate pills + memo list item
 * Fades out after ~70 frames.
 */
export const DrawerPreview: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideIn = frame >= startFrame
    ? spring({ frame: frame - startFrame, fps, config: { damping: 18, stiffness: 70 } })
    : 0;

  const fadeOut = frame >= startFrame + 70
    ? spring({ frame: frame - (startFrame + 70), fps, config: { damping: 20, stiffness: 100 } })
    : 0;

  const opacity = Math.max(0, slideIn - fadeOut);
  const translateX = interpolate(slideIn, [0, 1], [240, 0]);

  if (opacity < 0.01) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 50,
        right: 0,
        width: 240,
        height: 400,
        backgroundColor: colors.surface,
        borderLeft: `1px solid ${colors.border}`,
        boxShadow: colors.shadowMd,
        borderRadius: `${radii.lg}px 0 0 ${radii.lg}px`,
        padding: "20px 16px",
        opacity,
        transform: `translateX(${translateX}px)`,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: `1px solid ${colors.borderSubtle}` }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: colors.text, letterSpacing: -0.01 }}>
          Details
        </span>
        <span style={{ fontSize: 12, color: colors.textFaint, cursor: "pointer" }}>&#x2715;</span>
      </div>

      {/* Status card */}
      <div style={{ padding: 14, backgroundColor: colors.bg, borderRadius: radii.md, border: `1px solid ${colors.borderSubtle}` }}>
        {/* Progress header: large percentage + label */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 36, fontWeight: 700, color: colors.statusDone, lineHeight: 1, letterSpacing: -0.02, fontVariantNumeric: "tabular-nums" }}>
            100%
          </span>
          <span style={{ fontSize: 13, color: colors.textMuted }}>
            1/1 resolved
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ width: "100%", height: 6, borderRadius: 3, backgroundColor: colors.progressTrack, overflow: "hidden" }}>
          <div
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: colors.progressFill,
              borderRadius: 3,
            }}
          />
        </div>

        {/* Meta row: phase pill + gate pill */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${colors.borderSubtle}` }}>
          {/* Phase pill */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 99,
              color: colors.textMuted,
              backgroundColor: colors.hover,
            }}
          >
            Implementation
          </span>
          {/* Gate pill */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 99,
              color: colors.gateDoneText,
              backgroundColor: colors.gateDoneBg,
            }}
          >
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: colors.statusDone }} />
            done
          </span>
        </div>
      </div>

      {/* Memo list section */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.06, color: colors.textFaint, marginBottom: 6 }}>
          Memos
        </div>
        {/* Memo item (resolved) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderRadius: radii.sm,
            opacity: 0.5,
          }}
        >
          {/* Type indicator dot */}
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: colors.fixRed,
              flexShrink: 0,
            }}
          />
          {/* Memo text */}
          <span
            style={{
              flex: 1,
              fontSize: 13,
              lineHeight: 1.4,
              color: colors.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Use httpOnly cookies...
          </span>
          {/* Type label */}
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.03,
              color: colors.fixRed,
              flexShrink: 0,
            }}
          >
            fix
          </span>
        </div>
      </div>

      {/* Click hint */}
      <div style={{ fontSize: 10, color: colors.textFaint, fontStyle: "italic", marginTop: "auto" }}>
        Click any memo to navigate
      </div>
    </div>
  );
};
