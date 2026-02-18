import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors } from "../styles";

/**
 * Memo card — shows the full v1.2.0 lifecycle:
 *   Open → Working → Review (with Approve/Reject) → Done
 *
 * Timeline:
 *   frame 65:  card slides in
 *   frame 125: status → Working
 *   frame 180: status → Review, approve/reject buttons appear
 *   frame 250: user clicks Approve → Done
 */
export const MemoCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /* ─── Card entrance ─── */
  const cardIn = frame >= 65
    ? spring({ frame: frame - 65, fps, config: { damping: 16, stiffness: 80, mass: 0.8 } })
    : 0;
  const cardY = interpolate(cardIn, [0, 1], [14, 0]);

  /* ─── Status transitions ─── */
  const isWorking = frame >= 125 && frame < 180;
  const isReview = frame >= 180 && frame < 250;
  const isDone = frame >= 250;

  const badgeLabel = isDone ? "Done" : isReview ? "Review" : isWorking ? "Working" : "Open";
  const badgeColor = isDone
    ? colors.statusDone
    : isReview
    ? colors.statusReview
    : isWorking
    ? colors.statusWorking
    : colors.statusOpen;

  // Subtle scale pulse on status transitions
  const pulseAt = (trigger: number) => {
    if (frame >= trigger && frame <= trigger + 15) {
      const s = spring({ frame: frame - trigger, fps, config: { damping: 12, stiffness: 200, mass: 0.5 } });
      return 1 + 0.15 * Math.sin(s * Math.PI);
    }
    return 1;
  };
  const badgeScale = pulseAt(125) * pulseAt(180) * pulseAt(250);

  /* ─── Diff section (frame 155) ─── */
  const diffIn = frame >= 155
    ? spring({ frame: frame - 155, fps, config: { damping: 18, stiffness: 70 } })
    : 0;
  const diffY = interpolate(diffIn, [0, 1], [10, 0]);

  /* ─── Approve / Reject buttons (frame 190) ─── */
  const buttonsIn = frame >= 190
    ? spring({ frame: frame - 190, fps, config: { damping: 14, stiffness: 90, mass: 0.6 } })
    : 0;
  // Buttons disappear after approve click
  const buttonsOut = frame >= 248
    ? spring({ frame: frame - 248, fps, config: { damping: 20, stiffness: 150 } })
    : 0;
  const buttonsOpacity = Math.max(0, buttonsIn - buttonsOut);

  // Cursor hover effect on Approve button (frame 230-248)
  const isHovering = frame >= 232 && frame < 248;

  // Click flash (frame 248)
  const clickFlash = frame >= 248 && frame < 260
    ? interpolate(frame, [248, 252, 260], [0, 0.3, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <div
      style={{
        opacity: cardIn,
        transform: `translateY(${cardY}px)`,
        backgroundColor: colors.cardBg,
        borderRadius: 10,
        border: `1px solid ${colors.cardBorder}`,
        borderLeft: `3px solid ${colors.fixRed}`,
        padding: 12,
        marginBottom: 12,
        position: "relative",
      }}
    >
      {/* Click flash overlay */}
      {clickFlash > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 10,
            backgroundColor: `rgba(34, 197, 94, ${clickFlash})`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: colors.fixRed,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Fix
          </span>
          <span style={{ fontSize: 10, color: colors.textMuted }}>
            #m1
          </span>
        </div>

        {/* Status badge */}
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "white",
            backgroundColor: badgeColor,
            padding: "2px 8px",
            borderRadius: 10,
            transform: `scale(${badgeScale})`,
          }}
        >
          {badgeLabel}
        </span>
      </div>

      {/* Memo text */}
      <p style={{ fontSize: 12, color: colors.text, margin: 0, lineHeight: 1.6 }}>
        Use httpOnly cookies instead of localStorage for session tokens
      </p>

      {/* Inline diff section */}
      {diffIn > 0.01 && (
        <div
          style={{
            opacity: diffIn,
            transform: `translateY(${diffY}px)`,
            marginTop: 10,
            fontSize: 10,
            fontFamily: "'Fira Code', 'Cascadia Code', monospace",
            borderRadius: 6,
            overflow: "hidden",
            border: `1px solid ${colors.cardBorder}`,
          }}
        >
          <div
            style={{
              padding: "5px 10px",
              backgroundColor: colors.diffRemoveBg,
              color: colors.diffRemoveText,
              borderBottom: `1px solid rgba(255,255,255,0.04)`,
            }}
          >
            − localStorage
          </div>
          <div
            style={{
              padding: "5px 10px",
              backgroundColor: colors.diffAddBg,
              color: colors.diffAddText,
            }}
          >
            + httpOnly secure cookies
          </div>
        </div>
      )}

      {/* Approve / Reject buttons */}
      {buttonsOpacity > 0.01 && (
        <div
          style={{
            opacity: buttonsOpacity,
            display: "flex",
            gap: 6,
            marginTop: 10,
          }}
        >
          <button
            style={{
              flex: 1,
              fontSize: 10,
              fontWeight: 600,
              color: "white",
              backgroundColor: isHovering
                ? colors.approveGreen
                : "rgba(34, 197, 94, 0.8)",
              border: "none",
              borderRadius: 6,
              padding: "5px 0",
              cursor: "pointer",
              transform: `scale(${isHovering ? 1.03 : 1})`,
              boxShadow: isHovering ? "0 2px 8px rgba(34, 197, 94, 0.3)" : "none",
            }}
          >
            ✓ Approve
          </button>
          <button
            style={{
              flex: 1,
              fontSize: 10,
              fontWeight: 600,
              color: colors.text,
              backgroundColor: "rgba(255,255,255,0.06)",
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: 6,
              padding: "5px 0",
              cursor: "pointer",
            }}
          >
            ✕ Reject
          </button>
        </div>
      )}
    </div>
  );
};
