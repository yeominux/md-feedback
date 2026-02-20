import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { MockEditor } from "./components/MockEditor";
import { StatusBar } from "./components/StatusBar";
import { colors, container } from "./styles";

/**
 * MD Feedback v1.3.16 Demo — aligned to current webview structure
 * Story: annotate in editor first -> AI applies -> human review -> done
 */
export const DemoComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleIn = spring({ frame, fps, config: { damping: 22, stiffness: 70 } });
  const titleOut = frame > 80
    ? spring({ frame: frame - 80, fps, config: { damping: 22, stiffness: 110 } })
    : 0;
  const titleOpacity = frame < 80 ? titleIn : Math.max(0, 1 - titleOut);

  const mcpReminderIn = frame >= 420
    ? spring({ frame: frame - 420, fps, config: { damping: 18, stiffness: 85 } })
    : 0;

  return (
    <AbsoluteFill>
      <div style={container}>
        <MockEditor />
        <StatusBar />

        {mcpReminderIn > 0.01 && (
          <div
            style={{
              position: "absolute",
              right: 20,
              bottom: 58,
              opacity: mcpReminderIn,
              transform: `translateY(${interpolate(mcpReminderIn, [0, 1], [8, 0])}px)`,
            }}
          >
            <button
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 6,
                border: `1px dashed ${colors.border}`,
                background: "transparent",
                color: colors.textFaint,
              }}
            >
              <span>🔌</span>
              <span>Connect AI</span>
            </button>
          </div>
        )}
      </div>

      {titleOpacity > 0.01 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `rgba(20,20,20,${titleOpacity * 0.78})`,
          }}
        >
          <div style={{ textAlign: "center", opacity: titleOpacity }}>
            <div style={{ fontSize: 34, color: "#fff", fontWeight: 700, marginBottom: 12 }}>
              MD Feedback v1.3.16
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>
              Annotate first. MCP is optional.
            </div>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
