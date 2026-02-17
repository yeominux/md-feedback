import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { colors } from "../styles";

/** Simulated memo card in the sidebar */
export const MemoCard: React.FC = () => {
  const frame = useCurrentFrame();

  // Card appears at frame 30 (1s)
  const cardOpacity = interpolate(frame, [30, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cardSlide = interpolate(frame, [30, 45], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Status badge transitions
  // Open (frame 45-150) → Working (frame 90-150) → Done (frame 150+)
  const isWorking = frame >= 90 && frame < 150;
  const isDone = frame >= 150;

  const badgeLabel = isDone ? "Done" : isWorking ? "Working" : "Open";
  const badgeColor = isDone
    ? colors.statusDone
    : isWorking
    ? colors.statusWorking
    : colors.statusOpen;

  // Badge pulse animation when transitioning
  const badgeScale =
    (frame >= 148 && frame <= 160) || (frame >= 88 && frame <= 100)
      ? interpolate(
          frame,
          frame >= 148
            ? [148, 152, 160]
            : [88, 92, 100],
          [1, 1.3, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        )
      : 1;

  // Diff section appears at frame 110 (3.7s)
  const diffOpacity = interpolate(frame, [110, 130], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        opacity: cardOpacity,
        transform: `translateY(${cardSlide}px)`,
        backgroundColor: colors.cardBg,
        borderRadius: 8,
        border: `1px solid ${colors.cardBorder}`,
        borderLeft: `3px solid ${colors.fixRed}`,
        padding: 12,
        marginBottom: 12,
      }}
    >
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
            transition: "background-color 0.3s",
          }}
        >
          {badgeLabel}
        </span>
      </div>

      {/* Memo text */}
      <p style={{ fontSize: 12, color: colors.text, margin: 0, lineHeight: 1.5 }}>
        Use httpOnly cookies instead of localStorage for session tokens
      </p>

      {/* Inline diff section */}
      {diffOpacity > 0 && (
        <div
          style={{
            opacity: diffOpacity,
            marginTop: 10,
            fontSize: 10,
            fontFamily: "'Fira Code', monospace",
            borderRadius: 4,
            overflow: "hidden",
            border: `1px solid ${colors.cardBorder}`,
          }}
        >
          <div
            style={{
              padding: "4px 8px",
              backgroundColor: colors.diffRemoveBg,
              color: colors.diffRemoveText,
            }}
          >
            - localStorage
          </div>
          <div
            style={{
              padding: "4px 8px",
              backgroundColor: colors.diffAddBg,
              color: colors.diffAddText,
            }}
          >
            + httpOnly secure cookies
          </div>
        </div>
      )}
    </div>
  );
};
