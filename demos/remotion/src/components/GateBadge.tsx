import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors } from "../styles";

/**
 * Quality gate badge: Blocked → Approved
 *
 * Timeline:
 *   frame 90:  gate card appears
 *   frame 310: gate transitions Blocked → Approved
 */
export const GateBadge: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /* ─── Card entrance ─── */
  const gateIn = frame >= 90
    ? spring({ frame: frame - 90, fps, config: { damping: 18, stiffness: 70 } })
    : 0;
  const gateY = interpolate(gateIn, [0, 1], [10, 0]);

  /* ─── Gate transition at frame 310 ─── */
  const isApproved = frame >= 310;
  const transitionProgress = frame >= 310
    ? spring({ frame: frame - 310, fps, config: { damping: 13, stiffness: 100, mass: 0.7 } })
    : 0;

  const gateColor = isApproved
    ? colors.gateApproved
    : colors.gateBlocked;
  const gateLabel = isApproved ? "Approved" : "Blocked";
  const gateIcon = isApproved ? "✓" : "✕";
  const gateSubtext = isApproved ? "All items resolved" : "1 fix remaining";

  // Subtle pulse on transition
  const gateScale = frame >= 310 && frame <= 330
    ? 1 + 0.08 * Math.sin(transitionProgress * Math.PI)
    : 1;

  // Icon rotate on transition
  const iconRotate = isApproved
    ? interpolate(transitionProgress, [0, 1], [-90, 0])
    : 0;

  return (
    <div
      style={{
        opacity: gateIn,
        transform: `translateY(${gateY}px)`,
        marginTop: 12,
        padding: 10,
        backgroundColor: colors.cardBg,
        borderRadius: 10,
        border: `1px solid ${colors.cardBorder}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: colors.textMuted,
            textTransform: "uppercase",
            letterSpacing: 0.8,
          }}
        >
          Gate
        </span>
        <span style={{ fontSize: 10, color: colors.textMuted }}>merge</span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          transform: `scale(${gateScale})`,
          transformOrigin: "left center",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            backgroundColor: gateColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            color: "white",
            transform: `rotate(${iconRotate}deg)`,
            boxShadow: isApproved
              ? `0 0 12px rgba(34, 197, 94, 0.3)`
              : `0 0 8px rgba(239, 68, 68, 0.2)`,
          }}
        >
          {gateIcon}
        </span>
        <div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: gateColor,
              display: "block",
              lineHeight: 1.2,
            }}
          >
            {gateLabel}
          </span>
          <span style={{ fontSize: 10, color: colors.textMuted }}>
            {gateSubtext}
          </span>
        </div>
      </div>
    </div>
  );
};
