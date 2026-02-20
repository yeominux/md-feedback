import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, radii } from "../styles";

/**
 * Status bar — shows real-time progress with gate pills
 *
 * v1.4.0 redesign:
 *   - Right section: Wand2 icon + ClipboardCopy icon + CTA button + Settings gear
 *   - Approval uses simple CTA button (not dark red banner)
 *   - Approval dialog is a separate modal (shown briefly)
 *
 * Timeline:
 *   frame 220: Open → Working
 *   frame 310: Working → Review (CTA shows "Approve")
 *   frame 340: Approval dialog slides in
 *   frame 430: Review → Done
 */
export const StatusBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isDone = frame >= 430;
  const isReview = frame >= 310 && !isDone;
  const isWorking = frame >= 220 && !isReview && !isDone;
  const approvalRequired = frame >= 330 && frame < 430;
  const showApprovalDialog = frame >= 340 && frame < 410;

  const dialogIn = frame >= 340
    ? spring({ frame: frame - 340, fps, config: { damping: 18, stiffness: 90 } })
    : 0;
  const dialogOut = frame >= 400
    ? spring({ frame: frame - 400, fps, config: { damping: 20, stiffness: 100 } })
    : 0;
  const dialogOpacity = Math.max(0, dialogIn - dialogOut);

  const doneCount = isDone ? 1 : 0;

  const progressTarget = isDone ? 100 : isReview ? 66 : isWorking ? 34 : 12;
  const progressWidth = interpolate(
    spring({ frame: Math.max(0, frame - 210), fps, config: { damping: 20, stiffness: 80 } }),
    [0, 1],
    [8, progressTarget]
  );

  // Gate pill state
  const gateLabel = isDone ? "done" : "blocked";
  const gateBg = isDone ? colors.gateDoneBg : colors.gateBlockedBg;
  const gateText = isDone ? colors.gateDoneText : colors.gateBlockedText;
  const gateDotColor = isDone ? colors.statusDone : colors.fixRed;

  // Gate pill transition pulse
  const gatePulse = frame >= 430 && frame <= 445
    ? 1 + 0.12 * Math.sin(
        spring({ frame: frame - 430, fps, config: { damping: 12, stiffness: 200, mass: 0.5 } }) * Math.PI
      )
    : 1;

  // Status text — action-oriented
  const statusText = isDone
    ? "All done"
    : approvalRequired
    ? "1 to review"
    : isReview
    ? "1 to review"
    : isWorking
    ? "1 in progress"
    : "1 to do";

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
          gap: 12,
          padding: "0 16px",
          fontSize: 12,
          color: colors.text,
        }}
      >
        {/* Left: progress bar + hint + detail + gate pill */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{ flex: 1, maxWidth: 160, height: 4, borderRadius: 4, backgroundColor: colors.progressTrack, overflow: "hidden" }}>
            <div
              style={{
                width: `${progressWidth}%`,
                height: "100%",
                backgroundColor: colors.progressFill,
                borderRadius: 4,
              }}
            />
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: colors.textMuted, whiteSpace: "nowrap" }}>
            {doneCount}/1
          </span>
          <span style={{ fontSize: 12, color: colors.textFaint, whiteSpace: "nowrap" }}>
            {statusText}
          </span>

          {/* Gate pill */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              backgroundColor: gateBg,
              color: gateText,
              fontSize: 12,
              fontWeight: 500,
              padding: "2px 8px",
              borderRadius: radii.sm,
              transform: `scale(${gatePulse})`,
              textTransform: "uppercase",
              letterSpacing: 0.03,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: gateDotColor,
                boxShadow: isDone ? "0 0 6px rgba(5,150,105,0.4)" : "none",
              }}
            />
            {gateLabel}
          </span>
        </div>

        {/* Right: icon buttons + CTA + gear */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Wand2 icon — workflow prompt (v1.4.0) */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              borderRadius: radii.sm,
              color: colors.textFaint,
              fontSize: 13,
            }}
          >
            &#x2726;
          </span>

          {/* ClipboardCopy icon — clean copy (v1.4.0) */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              borderRadius: radii.sm,
              color: colors.textFaint,
              fontSize: 13,
            }}
          >
            &#x2398;
          </span>

          {/* CTA button */}
          {approvalRequired && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "4px 12px",
                borderRadius: radii.sm,
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.04,
                color: colors.surface,
                backgroundColor: colors.link,
              }}
            >
              Approve
            </span>
          )}
          {!approvalRequired && !isReview && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "4px 12px",
                borderRadius: radii.sm,
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.04,
                color: colors.surface,
                backgroundColor: colors.link,
              }}
            >
              Next Step
            </span>
          )}

          {/* Settings gear */}
          <span style={{ fontSize: 14, color: colors.textFaint, padding: 4 }}>&#x2699;</span>
        </div>
      </div>

      {/* Approval dialog overlay (v1.4.0 — focused modal, not inline banner) */}
      {showApprovalDialog && dialogOpacity > 0.01 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            bottom: 40,
            top: -460,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `rgba(0,0,0,${0.35 * dialogOpacity})`,
          }}
        >
          <div
            style={{
              width: 280,
              padding: 20,
              borderRadius: radii.md,
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              boxShadow: colors.shadowMd,
              opacity: dialogOpacity,
              transform: `translateY(${interpolate(dialogOpacity, [0, 1], [8, 0])}px)`,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 12 }}>
              Approve: apply_memo
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.04, color: colors.textFaint, marginBottom: 4 }}>
                Approver
              </div>
              <div style={{ height: 28, borderRadius: radii.sm, border: `1px solid ${colors.border}`, backgroundColor: colors.bg, padding: "4px 8px", fontSize: 13, color: colors.text, display: "flex", alignItems: "center" }}>
                vscode-user
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.04, color: colors.textFaint, marginBottom: 4 }}>
                Reason
              </div>
              <div style={{ height: 28, borderRadius: radii.sm, border: `1px solid ${colors.border}`, backgroundColor: colors.bg, padding: "4px 8px", fontSize: 13, color: colors.textMuted, display: "flex", alignItems: "center" }}>
                Approved via VS Code
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ flex: 1, padding: "6px 14px", borderRadius: radii.sm, fontSize: 12, fontWeight: 600, color: "#fff", backgroundColor: colors.link, textAlign: "center" }}>
                Confirm
              </span>
              <span style={{ padding: "6px 14px", borderRadius: radii.sm, fontSize: 12, fontWeight: 500, color: colors.textMuted, border: `1px solid ${colors.border}` }}>
                Cancel
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
