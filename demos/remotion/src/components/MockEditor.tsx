import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, editorPanel, radii } from "../styles";

export const MockEditor: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const paperIn = spring({ frame: Math.max(0, frame - 70), fps, config: { damping: 18, stiffness: 80 } });
  const onboardingIn = frame >= 95 ? spring({ frame: frame - 95, fps, config: { damping: 18, stiffness: 90 } }) : 0;
  const onboardingOut = frame >= 250 ? spring({ frame: frame - 250, fps, config: { damping: 20, stiffness: 120 } }) : 0;
  const onboardingOpacity = Math.max(0, onboardingIn - onboardingOut);

  const highlightIn = frame >= 145 ? spring({ frame: frame - 145, fps, config: { damping: 16, stiffness: 95 } }) : 0;
  const diffIn = frame >= 235 ? spring({ frame: frame - 235, fps, config: { damping: 16, stiffness: 90 } }) : 0;
  const reviewIn = frame >= 320 ? spring({ frame: frame - 320, fps, config: { damping: 16, stiffness: 95 } }) : 0;

  const lineNum = (n: number, visible = true) => (
    <span style={{ width: 26, display: "inline-block", textAlign: "right", marginRight: 14, color: colors.textFaint, opacity: visible ? 0.65 : 0.15, fontSize: 12 }}>
      {n}
    </span>
  );

  return (
    <div style={editorPanel}>
      <div style={{ padding: "0 0 8px 0", borderBottom: `1px solid ${colors.borderSubtle}`, background: colors.surface }}>
        <div
          style={{
            width: "100%",
            padding: "10px 16px",
            fontSize: 13,
            color: colors.textMuted,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>implementation-plan.md</span>
          <span>Markdown</span>
        </div>
      </div>

      {onboardingOpacity > 0.01 && (
        <div
          style={{
            margin: "0 0 0 0",
            padding: "10px 16px",
            borderBottom: `1px solid ${colors.borderSubtle}`,
            background: colors.surface,
            color: colors.textMuted,
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: onboardingOpacity,
            transform: `translateY(${interpolate(onboardingIn, [0, 1], [6, 0])}px)`,
          }}
        >
          <span>Select text, then press</span>
          <strong style={{ color: colors.text }}>1</strong>
          <span>/</span>
          <strong style={{ color: colors.text }}>2</strong>
          <span>/</span>
          <strong style={{ color: colors.text }}>3</strong>
          <span>for Highlight/Fix/Question</span>
        </div>
      )}

      <div style={{ padding: "20px 18px", display: "flex", justifyContent: "center" }}>
        <div
          style={{
            width: 740,
            minHeight: 392,
            background: colors.surface,
            borderRadius: radii.sm,
            boxShadow: `${colors.shadowSm}, 0 0 0 1px ${colors.borderSubtle}`,
            padding: "32px 34px 40px",
            opacity: paperIn,
            transform: `translateY(${interpolate(paperIn, [0, 1], [12, 0])}px)`,
          }}
        >
          <div style={{ fontSize: 15, lineHeight: 1.65, color: colors.text }}>
            <div>{lineNum(1)}<span style={{ fontWeight: 700, fontSize: 32, color: colors.heading }}># Authentication Module</span></div>
            <div style={{ marginTop: 8 }}>{lineNum(2, false)}&nbsp;</div>
            <div>{lineNum(3)}Store session tokens in localStorage for persistence across refreshes.</div>
            <div>{lineNum(4)}Add login throttling and password complexity checks.</div>
            <div style={{ marginTop: 6 }}>{lineNum(5, false)}&nbsp;</div>

            <div style={{ position: "relative" }}>
              {lineNum(6)}
              <span
                style={{
                  background: `rgba(220,38,38,${0.14 * highlightIn})`,
                  borderBottom: highlightIn > 0.3 ? `2px solid rgba(220,38,38,${highlightIn})` : "none",
                  borderRadius: radii.sm,
                  padding: "1px 4px",
                }}
              >
                Use httpOnly cookies instead of localStorage for session tokens.
              </span>
              {highlightIn > 0.01 && (
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: "#fff", background: colors.fixRed, borderRadius: radii.sm, padding: "2px 8px" }}>
                  FIX
                </span>
              )}
            </div>

            {diffIn > 0.01 && (
              <div
                style={{
                  margin: "10px 0 10px 40px",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  overflow: "hidden",
                  fontSize: 12,
                  opacity: diffIn,
                  transform: `translateY(${interpolate(diffIn, [0, 1], [8, 0])}px)`,
                }}
              >
                <div style={{ padding: "5px 10px", background: colors.hover, color: colors.textFaint, fontSize: 11 }}>AI applied change</div>
                <div style={{ padding: "5px 10px", background: colors.diffRemoveBg, color: colors.diffRemoveText }}>- localStorage session token</div>
                <div style={{ padding: "5px 10px", background: colors.diffAddBg, color: colors.diffAddText }}>+ secure httpOnly SameSite cookie</div>
              </div>
            )}

            {reviewIn > 0.01 && (
              <div
                style={{
                  margin: "6px 0 8px 40px",
                  opacity: reviewIn,
                  fontSize: 11,
                  color: colors.textMuted,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <span>CodeLens:</span>
                <span style={{ color: colors.approveGreen, fontWeight: 600 }}>$(check) Approve Memo</span>
                <span style={{ color: colors.textFaint }}>|</span>
                <span style={{ color: colors.rejectAmber }}>$(x) Reject</span>
              </div>
            )}

            <div>{lineNum(7)}Add CSRF protection middleware to all API routes.</div>
          </div>
        </div>
      </div>
    </div>
  );
};
