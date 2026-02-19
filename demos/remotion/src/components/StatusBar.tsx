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
  const workingCount = isWorking ? 1 : 0;
  const openCount = 3 - doneCount - reviewCount - workingCount;

  // Progress bar with spring
  const progressTarget = isDone ? 33.3 : 0;
  const progressWidth = isDone
    ? interpolate(
        spring({ frame: frame - 430, fps, config: { damping: 18, stiffness: 60 } }),
        [0, 1],
        [0, progressTarget]
      )
    : 0;

  // Status text
  const statusText = isDone
    ? "1 fix approved"
    : approvalRequired
    ? "Approval required before high-risk action"
    : isReview
    ? "Waiting for human review..."
    : isWorking
    ? "AI applying fix..."
    : "Ready";

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
        height: 28,
        backgroundColor: colors.accent,
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        fontSize: 11,
        color: "white",
        gap: 14,
      }}
    >
      <span style={{ fontWeight: 600, letterSpacing: 0.2 }}>MD Feedback</span>

      {/* Counts */}
      <span style={{ opacity: 0.9 }}>
        {doneCount}/3 done
        {reviewCount > 0 && ` · ${reviewCount} review`}
        {workingCount > 0 && ` · ${workingCount} working`}
        {openCount > 0 && ` · ${openCount} open`}
      </span>

      {/* Mini progress bar */}
      <div
        style={{
          width: 80,
          height: 3,
          backgroundColor: "rgba(255,255,255,0.2)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progressWidth}%`,
            height: "100%",
            backgroundColor: "white",
            borderRadius: 2,
          }}
        />
      </div>

      {/* Status text */}
      <span
        style={{
          marginLeft: "auto",
          fontSize: 10,
          opacity: 0.85,
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {isReview && (
          <span
            style={{
              display: "inline-block",
              width: 5,
              height: 5,
              borderRadius: "50%",
              backgroundColor: colors.statusReview,
              transform: `scale(${reviewDotScale})`,
            }}
          />
        )}
        {statusText}
      </span>

      {approvalRequired && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginLeft: 8,
            opacity: approvalFormIn,
            transform: `translateY(${interpolate(approvalFormIn, [0, 1], [6, 0])}px)`,
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "#fecaca",
              backgroundColor: "rgba(127,29,29,0.8)",
              border: "1px solid rgba(248,113,113,0.5)",
              borderRadius: 10,
              padding: "2px 6px",
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
          >
            action approval required
          </span>
          <span style={{ fontSize: 9, opacity: 0.9, backgroundColor: "rgba(255,255,255,0.12)", padding: "2px 6px", borderRadius: 4 }}>
            approver: vscode-user
          </span>
          <span style={{ fontSize: 9, opacity: 0.9, backgroundColor: "rgba(255,255,255,0.12)", padding: "2px 6px", borderRadius: 4 }}>
            reason: approve batch_apply
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, backgroundColor: "rgba(34,197,94,0.9)", color: "#052e16", padding: "2px 8px", borderRadius: 4 }}>
            Approve Action
          </span>
        </div>
      )}
    </div>
  );
};
