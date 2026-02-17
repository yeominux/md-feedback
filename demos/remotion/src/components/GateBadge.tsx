import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { colors } from "../styles";

/** Quality gate badge: Blocked → Approved */
export const GateBadge: React.FC = () => {
  const frame = useCurrentFrame();

  // Gate appears at frame 60 (2s)
  const gateOpacity = interpolate(frame, [60, 75], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Gate transitions at frame 210 (7s)
  const isApproved = frame >= 210;

  const gateColor = isApproved ? colors.gateApproved : colors.gateBlocked;
  const gateLabel = isApproved ? "Approved" : "Blocked";
  const gateIcon = isApproved ? "\u2713" : "\u2717";

  // Pulse when transitioning
  const gateScale =
    frame >= 208 && frame <= 220
      ? interpolate(frame, [208, 212, 220], [1, 1.2, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  return (
    <div
      style={{
        opacity: gateOpacity,
        marginTop: 16,
        padding: 10,
        backgroundColor: colors.cardBg,
        borderRadius: 8,
        border: `1px solid ${colors.cardBorder}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 10, color: colors.textMuted, fontWeight: 600 }}>
          GATE
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
            width: 20,
            height: 20,
            borderRadius: "50%",
            backgroundColor: gateColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            color: "white",
          }}
        >
          {gateIcon}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: gateColor,
          }}
        >
          {gateLabel}
        </span>
        <span style={{ fontSize: 10, color: colors.textMuted }}>
          {isApproved ? "All items resolved" : "1 fix remaining"}
        </span>
      </div>
    </div>
  );
};
