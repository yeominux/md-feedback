import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { colors, editorPanel } from "../styles";

/** Simulated VS Code markdown editor panel */
export const MockEditor: React.FC = () => {
  const frame = useCurrentFrame();

  // Fix annotation highlight appears at frame 15 (0.5s)
  const highlightOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Diff appears at frame 90 (3s)
  const diffOpacity = interpolate(frame, [90, 110], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Strikethrough animation on the "before" text
  const strikeWidth = interpolate(frame, [95, 115], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={editorPanel}>
      {/* File tab */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          paddingBottom: 8,
          borderBottom: `1px solid ${colors.sidebarBorder}`,
        }}
      >
        <span style={{ color: colors.accent, fontSize: 12 }}>M</span>
        <span style={{ color: colors.text, fontSize: 13 }}>
          implementation-plan.md
        </span>
        <span style={{ color: colors.textMuted, fontSize: 11, marginLeft: "auto" }}>
          UTF-8
        </span>
      </div>

      {/* Markdown content */}
      <div style={{ fontSize: 14, lineHeight: 1.8 }}>
        <h2 style={{ color: colors.heading, fontSize: 18, marginBottom: 12 }}>
          # Authentication Module
        </h2>

        <p style={{ color: colors.text, marginBottom: 8 }}>
          Store session tokens in localStorage for persistence
        </p>
        <p style={{ color: colors.text, marginBottom: 8 }}>
          across browser refreshes.
        </p>

        {/* Fix annotation highlight */}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <span
            style={{
              backgroundColor: colors.fixRedBg,
              borderBottom: `2px solid ${colors.fixRed}`,
              padding: "2px 4px",
              borderRadius: 3,
              opacity: highlightOpacity,
              display: "inline",
            }}
          >
            Use httpOnly cookies instead of localStorage
          </span>

          {/* Annotation marker */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginLeft: 8,
              backgroundColor: colors.fixRed,
              color: "white",
              fontSize: 10,
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: 10,
              opacity: highlightOpacity,
              verticalAlign: "middle",
            }}
          >
            FIX
          </span>
        </div>

        {/* Inline diff - appears at 3s */}
        {diffOpacity > 0 && (
          <div
            style={{
              opacity: diffOpacity,
              marginTop: 8,
              marginBottom: 12,
              borderRadius: 6,
              border: `1px solid ${colors.cardBorder}`,
              overflow: "hidden",
              fontSize: 12,
              fontFamily: "'Fira Code', 'Cascadia Code', monospace",
            }}
          >
            <div
              style={{
                backgroundColor: colors.diffRemoveBg,
                padding: "6px 12px",
                position: "relative",
              }}
            >
              <span style={{ color: colors.fixRedLight, marginRight: 8 }}>
                -
              </span>
              <span style={{ color: colors.diffRemoveText }}>
                Store session tokens in{" "}
              </span>
              <span
                style={{
                  color: colors.diffRemoveText,
                  textDecoration: "line-through",
                  textDecorationColor: colors.fixRed,
                }}
              >
                localStorage
              </span>
            </div>
            <div
              style={{
                backgroundColor: colors.diffAddBg,
                padding: "6px 12px",
              }}
            >
              <span style={{ color: colors.diffAddText, marginRight: 8 }}>
                +
              </span>
              <span style={{ color: colors.diffAddText }}>
                Store session tokens in{" "}
              </span>
              <span
                style={{
                  color: colors.diffAddText,
                  fontWeight: 600,
                }}
              >
                httpOnly secure cookies
              </span>
            </div>
          </div>
        )}

        <p style={{ color: colors.text }}>
          Add CSRF protection middleware to all API routes.
        </p>
      </div>
    </div>
  );
};
