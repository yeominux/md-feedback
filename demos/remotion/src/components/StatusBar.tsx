import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { colors } from "../styles";

/** Simulated status bar at the bottom showing progress */
export const StatusBar: React.FC = () => {
  const frame = useCurrentFrame();

  // Progress transitions
  const isDone = frame >= 150;
  const isWorking = frame >= 90 && !isDone;

  const doneCount = isDone ? 1 : 0;
  const workingCount = isWorking ? 1 : 0;
  const openCount = 3 - doneCount - workingCount;

  // Progress bar width
  const progressWidth = interpolate(
    frame,
    [0, 90, 150, 160],
    [0, 0, 0, 33.3],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

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
        padding: "0 12px",
        fontSize: 11,
        color: "white",
        gap: 16,
      }}
    >
      <span style={{ fontWeight: 600 }}>MD Feedback</span>
      <span>
        {doneCount}/3 done
        {workingCount > 0 && ` | ${workingCount} working`}
        {openCount > 0 && ` | ${openCount} open`}
      </span>

      {/* Mini progress bar */}
      <div
        style={{
          width: 80,
          height: 4,
          backgroundColor: "rgba(255,255,255,0.3)",
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
            transition: "width 0.3s",
          }}
        />
      </div>

      <span style={{ marginLeft: "auto", fontSize: 10, opacity: 0.8 }}>
        {isWorking ? "AI applying fix..." : isDone ? "Fix applied" : "Ready"}
      </span>
    </div>
  );
};
