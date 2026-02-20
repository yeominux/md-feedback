import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, radii } from "../styles";

/**
 * DrawerPreview — simplified MetadataDrawer progress section
 *
 * Slides in from the right at a given start frame,
 * shows: large "100%" + green progress bar + "1/1 resolved" + "Quality checks: done"
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
        width: 220,
        height: 400,
        backgroundColor: colors.surface,
        borderLeft: `1px solid ${colors.border}`,
        boxShadow: colors.shadowMd,
        borderRadius: `${radii.lg}px 0 0 ${radii.lg}px`,
        padding: "24px 20px",
        opacity,
        transform: `translateX(${translateX}px)`,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Header */}
      <div style={{ fontSize: 13, fontWeight: 700, color: colors.heading, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Details
      </div>

      {/* Large percentage */}
      <div style={{ fontSize: 32, fontWeight: 700, color: colors.statusDone, textAlign: "center", marginTop: 8 }}>
        100%
      </div>

      {/* Progress bar */}
      <div style={{ width: "100%", height: 8, borderRadius: radii.sm, backgroundColor: colors.progressTrack, overflow: "hidden" }}>
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: colors.progressFill,
            borderRadius: radii.sm,
          }}
        />
      </div>

      {/* Resolved count */}
      <div style={{ fontSize: 13, color: colors.text, textAlign: "center" }}>
        1/1 resolved
      </div>

      {/* Separator */}
      <div style={{ height: 1, backgroundColor: colors.border, margin: "4px 0" }} />

      {/* Quality checks */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            backgroundColor: colors.gateDoneBg,
            color: colors.gateDoneText,
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: radii.sm,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: colors.statusDone,
            }}
          />
          done
        </span>
        <span style={{ fontSize: 11, color: colors.textMuted }}>Quality checks</span>
      </div>

      {/* Click hint */}
      <div style={{ fontSize: 10, color: colors.textFaint, fontStyle: "italic", marginTop: "auto" }}>
        Click any memo to navigate
      </div>
    </div>
  );
};
