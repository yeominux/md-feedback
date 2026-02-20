import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, radii } from "../styles";

/**
 * Memo card — shows lifecycle status mirrored from editor review:
 *   Open → Working → Review → Done
 *
 * v1.4.0 redesign:
 *   - Header: clickable type pill with dropdown chevron (type switching)
 *   - Status: pill button with dropdown
 *   - Footer: approve/reject use subtle icon-style buttons (theme tokens)
 *   - Done: opacity 0.6, text line-through
 *   - Card borderRadius: 0 8 8 0 (left border preserved)
 *
 * Timeline:
 *   frame 105: card slides in
 *   frame 220: status → Working
 *   frame 310: status → Review
 *   frame 430: editor approval completed → Done
 */
export const MemoCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /* ─── Card entrance ─── */
  const cardIn = frame >= 105
    ? spring({ frame: frame - 105, fps, config: { damping: 16, stiffness: 80, mass: 0.8 } })
    : 0;
  const cardY = interpolate(cardIn, [0, 1], [14, 0]);

  /* ─── Status transitions ─── */
  const isWorking = frame >= 220 && frame < 310;
  const isReview = frame >= 310 && frame < 430;
  const isDone = frame >= 430;

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
  const badgeScale = pulseAt(220) * pulseAt(310) * pulseAt(430);

  /* ─── Diff section (frame 260) ─── */
  const diffIn = frame >= 260
    ? spring({ frame: frame - 260, fps, config: { damping: 18, stiffness: 70 } })
    : 0;
  const diffY = interpolate(diffIn, [0, 1], [10, 0]);

  /* ─── Approve/Reject buttons (Review state) ─── */
  const buttonsIn = frame >= 320
    ? spring({ frame: frame - 320, fps, config: { damping: 16, stiffness: 90 } })
    : 0;

  return (
    <div
      style={{
        opacity: isDone ? 0.6 * cardIn : cardIn,
        transform: `translateY(${cardY}px)`,
        backgroundColor: colors.cardBg,
        borderRadius: `0 ${radii.md}px ${radii.md}px 0`,
        border: `1px solid ${colors.cardBorder}`,
        borderLeft: `3px solid ${colors.fixRed}`,
        marginBottom: 12,
        position: "relative",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px 4px",
        }}
      >
        {/* Clickable type pill with dropdown chevron (v1.4.0 type switching) */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontSize: 12,
            fontWeight: 600,
            color: colors.fixRed,
            textTransform: "uppercase",
            letterSpacing: 0.04,
            backgroundColor: colors.fixPillBg,
            padding: "2px 8px",
            borderRadius: radii.sm,
            cursor: "pointer",
          }}
        >
          Fix
          <span style={{ fontSize: 9, opacity: 0.7 }}>&#x25BE;</span>
        </span>

        <span style={{ flex: 1 }} />

        {/* Status pill */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 500,
            color: badgeColor,
            padding: "2px 8px",
            borderRadius: radii.sm,
            transform: `scale(${badgeScale})`,
            cursor: "pointer",
          }}
        >
          {badgeLabel}
        </span>
      </div>

      {/* Memo text */}
      <div style={{ padding: "0 12px 8px 12px" }}>
        <p
          style={{
            fontSize: 14,
            color: colors.text,
            margin: 0,
            lineHeight: 1.5,
            textDecoration: isDone ? "line-through" : "none",
            ...(isDone ? { color: colors.textFaint } : {}),
          }}
        >
          Use httpOnly cookies instead of localStorage for session tokens
        </p>
      </div>

      {/* Footer: anchor + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px 8px 12px",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontStyle: "italic",
            color: colors.textFaint,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          line 6 &middot; implementation-plan.md
        </span>
      </div>

      {/* Inline diff section */}
      {diffIn > 0.01 && (
        <div
          style={{
            opacity: diffIn,
            transform: `translateY(${diffY}px)`,
            margin: "0 12px 8px",
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
            &minus; localStorage
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

      {/* Approve / Reject footer — subtle icon-style buttons (v1.4.0) */}
      {isReview && buttonsIn > 0.01 && (
        <div
          style={{
            padding: "0 12px 8px",
            display: "flex",
            gap: 4,
            opacity: buttonsIn,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 500,
              color: colors.statusDone,
              backgroundColor: colors.gateDoneBg,
              padding: "4px 8px",
              borderRadius: radii.sm,
              cursor: "pointer",
            }}
          >
            &#x2713; Approve
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              borderRadius: radii.sm,
              color: colors.textFaint,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            &#x2717;
          </span>
        </div>
      )}
    </div>
  );
};
