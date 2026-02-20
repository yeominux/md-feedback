import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors } from "../styles";

/**
 * Status bar — shows real-time progress with smooth transitions
 *
 * Timeline:
 *   frame 220: Open → Working
 *   frame 310: Working → Review
 *   frame 330: approval-required banner + mini input appears
 *   frame 430: Review → Done
 */
export const StatusBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isDone = frame >= 430;
  const isReview = frame >= 310 && !isDone;
  const isWorking = frame >= 220 && !isReview && !isDone;
  const approvalRequired = frame >= 330 && frame < 430;
  const approvalFormIn = frame >= 338
    ? spring({ frame: frame - 338, fps, config: { damping: 18, stiffness: 90 } })
    : 0;

  const doneCount = isDone ? 1 : 0;
  const reviewCount = isReview ? 1 : 0;

  const progressTarget = isDone ? 100 : isReview ? 66 : isWorking ? 34 : 12;
  const progressWidth = interpolate(
    spring({ frame: Math.max(0, frame - 210), fps, config: { damping: 20, stiffness: 80 } }),
    [0, 1],
    [8, progressTarget]
  );

  // Status text
  const statusText = isDone
    ? "1/1 resolved"
    : approvalRequired
    ? "review required"
    : isReview
    ? "needs review"
    : isWorking
    ? "applying..."
    : "ready";

  // Subtle indicator dot for review state
  const reviewDotScale = isReview
    ? 1 + 0.2 * Math.sin((frame - 310) * 0.1)
    : 1;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 40,
        backgroundColor: colors.surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderTop: `1px solid ${colors.border}`,
        boxShadow: "0 -4px 24px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          width: 760,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "0 12px",
          fontSize: 11,
          color: colors.text,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{ width: 160, height: 4, borderRadius: 2, backgroundColor: colors.progressTrack, overflow: "hidden" }}>
            <div
              style={{
                width: `${progressWidth}%`,
                height: "100%",
                backgroundColor: colors.progressFill,
                borderRadius: 2,
              }}
            />
          </div>
          <span style={{ fontSize: 10, color: colors.textMuted, opacity: 0.75 }}>{statusText}</span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: isDone ? "#059669" : isReview ? "#6366f1" : "#d97706",
              boxShadow: isDone ? "0 0 6px rgba(5,150,105,0.4)" : "none",
              transform: `scale(${reviewDotScale})`,
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {reviewCount > 0 && (
            <span
              style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: colors.surface,
              backgroundColor: colors.link,
              borderRadius: 4,
              padding: "4px 10px",
            }}
            >
              Review First
            </span>
          )}
          {!reviewCount && (
            <span
              style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: colors.surface,
              backgroundColor: colors.link,
              borderRadius: 4,
              padding: "4px 10px",
            }}
            >
              Next Step
            </span>
          )}
          <span style={{ fontSize: 12, color: colors.textMuted }}>⚙</span>
        </div>
      </div>

      {approvalRequired && (
        <div
          style={{
            position: "absolute",
            bottom: 46,
            right: 20,
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: approvalFormIn,
            transform: `translateY(${interpolate(approvalFormIn, [0, 1], [6, 0])}px)`,
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "#fef2f2",
              backgroundColor: "rgba(127,29,29,0.9)",
              border: "1px solid rgba(248,113,113,0.55)",
              borderRadius: 10,
              padding: "2px 6px",
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
          >
            action approval required
          </span>
          <span style={{ fontSize: 9, opacity: 0.9, backgroundColor: "rgba(0,0,0,0.45)", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>
            approver: vscode-user
          </span>
          <span style={{ fontSize: 9, opacity: 0.9, backgroundColor: "rgba(0,0,0,0.45)", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>
            reason: approve checkpoint
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, backgroundColor: "rgba(34,197,94,0.9)", color: "#052e16", padding: "2px 8px", borderRadius: 4 }}>
            Approve Action
          </span>
        </div>
      )}
    </div>
  );
};
