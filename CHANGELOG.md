# Changelog

## [1.3.18] - 2026-02-20

### Changed
- `apply_memo` and `batch_apply` now reject ambiguous `text_replace` requests when `oldText` appears multiple times and neither `occurrence` nor `replaceAll` is provided
- MCP tool schemas now document explicit occurrence requirements for multi-match text replacement

### Improved
- Added regression tests covering ambiguous text replacement rejection in both single and batch memo application paths
- README now documents ambiguity-safe text replacement behavior for agent workflows

## [1.3.17] - 2026-02-20

### Improved
- Annotation anchors now stay attached to the intended lines more reliably when similar text appears multiple times in a document
- Memo placement remains stable even when metadata blocks are grouped at the end of the markdown file

### Fixed
- Resolved an issue where some memos could be reinserted near the document end instead of their original context
- Preserved backslashes and special marker text in memo content across repeated save and reload cycles

## [1.3.16] - 2026-02-20

### Added
- New `list_documents` MCP tool to discover markdown files in workspace (including annotated-only mode)
- VS Code walkthrough and editor-level `1/2/3` annotation commands for faster first-use onboarding
- Extension now activates automatically when VS Code starts (no manual trigger needed)
- Status overview in the details drawer shows resolved, in-progress, and blocking counts at a glance

### Changed
- Status bar redesigned with a progress indicator and color-coded gate dots replacing the previous badge layout
- Approval flow now uses a focused modal dialog instead of an inline sidebar form
- Memo cards use a two-row layout with colored status dot, inline editing, and keyboard-navigable status menu
- Details drawer header renamed from "Gates & Cursor" to "Details" with live status summary
- Onboarding flow now starts with annotation first; MCP setup is optional and non-blocking
- Onboarding banner now mentions keyboard shortcuts `1/2/3` alongside click actions
- Demo animation simplified and reduced by 41% in file size for faster loading
- MCP/README/package metadata now consistently documents 27 tools and current version

### Improved
- Delete action now requires a brief confirmation hold to prevent accidental memo removal
- Status menu supports arrow-key navigation, Enter to select, and Escape to dismiss
- Button press animation added for tactile feedback on interactive elements
- Theme tokens expanded with progress bar, diff block, and distinct `needs_review` status colors

### Fixed
- `apply_memo` / `batch_apply` text replacement now supports safe single-occurrence replacement by default
- `batch_apply` rollback errors are now surfaced instead of being silently swallowed
- File mutex now includes cross-process lock with timeout to reduce race conditions
- Release guard now tolerates missing/transient filesystem entries during scan

## [1.3.15] - 2026-02-20

### Fixed
- Highlight mark recovery no longer creates phantom duplicate memos when the memo anchorText includes a heading prefix (`### `) that the highlight mark omits

## [1.3.14] - 2026-02-20

### Added
- Reject reason — rejecting a memo now prompts for an optional reason that agents can read to avoid repeating mistakes
- MCP tool table in README now documents all 26 tools (7 were missing)

### Improved
- BOM-tolerant JSON parsing extracted to shared `parseJsonWithBom` utility, eliminating duplication across 3 packages

## [1.3.13] - 2026-02-20

### Fixed
- `Approve Action` now enables immediately after approving all memos — previously the button stayed disabled until a manual reload
- `Approve Action` click handler now correctly reads BOM-prefixed workflow sidecar files
- MCP server workflow and severity sidecar reads are now BOM-tolerant


## [1.3.12] - 2026-02-20

### Fixed
- `Approve Action` click handler now correctly reads BOM-prefixed workflow sidecar files — previously the button was visible but clicking it silently failed, showing "No pending approval checkpoint"
- MCP server workflow and severity sidecar reads are now BOM-tolerant, preventing silent fallback to default state

## [1.3.11] - 2026-02-19

### Fixed
- `Approve Action` no longer disappears when workflow sidecar files contain UTF-8 BOM.
- Sidecar JSON parsing is now BOM-tolerant for stable workflow and severity status rendering.

## [1.3.10] - 2026-02-19

### Fixed
- `Approve Action` visibility now remains stable even when focus leaves the markdown editor, by reading workflow sidecars from the current document context
- Resolved merge-conflict artifacts that could break panel behavior and release/test pipelines

## [1.3.9] - 2026-02-19

### Changed
- `Approve Action` is now always visible when a pending action approval exists, even if memo reviews are still pending
- When memo reviews are pending, `Approve Action` remains visible but disabled with guidance tooltip to resolve memo reviews first

### Improved
- Extension now shows a one-time per-version notice that VS Code extension updates and npm MCP updates are separate channels
- Added quick-copy actions for `npm update -g md-feedback` and `npx -y md-feedback` in that notice

## [1.3.8] - 2026-02-19

### Changed
- Approval flow UX is clarified: checkpoint approval and memo approval are shown as separate actions
- Conflicting duplicate approve CTA in the panel is removed to prevent action ambiguity
- Demo GIF is refreshed to match the current approval flow in the editor

### Improved
- MCP workflow policy handling is more predictable for agent-driven review operations
- Publishing commands are now cross-shell safe (PowerShell and POSIX) for VS Code Marketplace and Open VSX

## [1.3.7] - 2026-02-19

### Fixed
- Memo cards no longer disappear immediately after blur when newly created and empty; accidental auto-delete behavior is prevented
- Release validation no longer fails intermittently due to package resolution issues during test runs
- Recovered memos created from `HIGHLIGHT_MARK` metadata now use deterministic IDs, so subsequent agent actions (for example `respond_to_memo`) can reliably target them

### Improved
- Added memo save-behavior regression test coverage in VS Code tests
- Added shared parser regression coverage for missing-memo recovery from persisted highlight marks
- Added MCP tool regression coverage to ensure highlight marks are preserved when responding to recovered memos

## [1.3.6] - 2026-02-19

### Improved
- Privacy policy included — confirms no data is collected by the extension or MCP server
- Code of conduct added for community contributors
- License text now includes machine-readable SPDX identifier for tooling compatibility
- Security policy updated to cover v1.3.x in supported versions
- npm package now ships license text alongside the server binary
- Marketplace listing now shows a changelog tab for version history
- Demo animation includes descriptive alt text for screen reader accessibility
- Marketplace description clarifies that MD Feedback is free for personal and non-commercial use
- npm and VS Code Marketplace descriptions now reference each other for discoverability
- VS Code category changed from "Other" to "Linters" for better Marketplace browsing
- Package keywords consolidated across npm and Marketplace to reduce duplication
- Publishing guide documents which packages are public and which are internal

## [1.3.5] - 2026-02-19

### Fixed
- REVIEW_RESPONSE blocks no longer drift to end-of-file after `text_replace` operations
- Memo anchors now refresh on parse, preventing stale hash references from accumulating
- Re-approval loop is now stable across repeated batch_apply + respond_to_memo cycles

### Improved
- `respond_to_memo` now reuses shared anchor logic instead of a duplicate implementation
- `batch_apply` now keeps memo `anchorText` in sync after text replacements
- VS Code timing behavior is now configurable via settings:
  `md-feedback.autoCheckpointIntervalMs`,
  `md-feedback.sectionTrackDebounceMs`,
  `md-feedback.editorSwitchDebounceMs`,
  `md-feedback.fileWatchDebounceMs`
- MCP/Shared stability coverage expanded with additional query/tool regression tests
- Shared parsing now includes structured JSON parse error types for clearer diagnostics
- MCP tool failures now return standardized error codes/types/details across mutation/query paths
- MCP server tests now include structured failure-path assertions (anchor/memo/handoff/validation)
- Export context generation now uses a format registry (easier target extension, lower switch churn)
- Shared type docs now align with `generateId(...)` usage for impl/artifact/dependency/checkpoint IDs
- Shared markdown parsing no longer keeps module-level global `/g` regex state

## [1.3.4] - 2026-02-19

### Fixed
- REVIEW_RESPONSE blocks no longer drift to end-of-file after `text_replace` operations
- Memo anchors now refresh on parse, preventing stale hash references from accumulating
- Re-approval loop is now stable across repeated batch_apply + respond_to_memo cycles

### Improved
- `respond_to_memo` now reuses shared anchor logic instead of a duplicate implementation
- `batch_apply` now keeps memo `anchorText` in sync after text replacements

## [1.3.3] - 2026-02-18

### Changed
- AI agents can no longer set terminal memo statuses (answered, done, failed, wontfix) via MCP tools — these now require human approval through VS Code CodeLens
- `respond_to_memo` now sets status to `needs_review` instead of `answered`
- `update_memo_status` and `update_memo_progress` no longer accept terminal statuses

## [1.3.2] - 2026-02-18

Review flow is clearer in the editor, and release reliability has been improved.

### Fixed
- Demo now visibly shows approval happening in the editor CodeLens flow, not as a sidebar action
- Release commits now include all intended tracked changes, preventing release-file omissions
- Release flow now handles repository push configuration more reliably

### Added
- Automatic GitHub Release creation from the latest changelog section on tag push
- Automatic post-release synchronization through pull-request safeguards

### Improved
- README and Marketplace copy now explicitly reflect the latest review flow behavior

## [1.3.1] - 2026-02-18

Human review loop is now stable in the actual VS Code UI.

### Fixed
- Highlights now persist after save and reload
- AI-delivered review items now appear reliably as `Needs Review` in the UI
- Approve/Reject review flow now syncs consistently between MCP updates and the extension UI
- Syntax highlighting inside code blocks is rendered correctly again in the review panel

### Improved
- Demo GIF and product demo flow now match the current editor-first review experience

## [1.3.0] - 2026-02-18

More reliable MCP + extension experience in real projects.

### Fixed
- Better workspace detection for MCP clients that do not start in the project folder
- Review status updates are reflected more reliably during active editing

### Improved
- Packaged artifacts are cleaner and safer for distribution

## [1.2.1] - 2026-02-18

Review from your editor — no sidebar needed.

### Added
- CodeLens in editor — approve or reject annotations directly in the markdown file
- Activity Bar badge — pending review count visible at a glance
- Status bar indicator — persistent review count in VS Code's bottom bar
- Toast notifications — get notified when AI delivers work for review
- Keyboard shortcuts — Ctrl+Shift+A to approve, Ctrl+Shift+X to reject

### Improved
- Approve/Reject buttons are now always visible on needs_review annotations (no hover required)

## [1.2.0] - 2026-02-18

Human control over AI work — approve, reject, override, and see what changes before they happen.

### Added
- Review status — AI work lands in "Needs Review" state, you approve or reject after seeing what changed
- Approve / Reject buttons on annotations — one click to accept or dismiss AI work
- CodeLens in editor — approve or reject annotations directly from the markdown file, no sidebar needed
- Activity Bar badge — see how many annotations need review at a glance
- Status bar indicator — persistent review count in VS Code's bottom bar
- Toast notifications — get notified when AI delivers work for review
- Keyboard shortcuts — Ctrl+Shift+A to approve, Ctrl+Shift+X to reject nearest annotation
- Gate override — manually set gate status from the metadata drawer
- External file diffs — see file_create and file_patch content inline before applying
- Gate transition toast — VS Code notification when gates change state
- File mutex — prevents data corruption from concurrent MCP tool calls

### Improved
- Anchor text matching — annotations stick to their intended location more reliably

## [1.1.1] - 2026-02-17

Demo GIF now shows in README — on GitHub, npm, and VS Code Marketplace.

### Added
- Animated demo GIF in README hero image
- GitHub Actions workflow for auto-rendering demo GIF

### Improved
- README now lists all v1.1.0 features (inline diffs, 6 status badges, rollback, batch ops, file safety, auto-refresh)
- llms.txt now documents all 19 MCP tools (was missing 6)
- Security policy updated for v1.1.x

## [1.1.0] - 2026-02-17

AI agents can now apply fixes, track progress, and roll back changes — all through MCP.

### Added
- AI can apply fixes to your document and create files (apply_memo tool with dry-run preview)
- Multiple fixes can be applied at once (batch_apply)
- AI can roll back its last change if something went wrong (rollback_memo)
- Progress tracking shows what the AI is working on (update_memo_progress)
- See implementation history for each annotation (get_memo_changes)
- Link source files to annotations (link_artifacts)
- Inline before/after diffs shown directly on memo cards
- 6 memo statuses with color-coded badges: Open, Working, Answered, Done, Failed, Won't Fix
- File safety checks prevent writing to sensitive files (.env, credentials, node_modules)
- Document auto-refreshes when AI writes changes via MCP

### Improved
- MCP server now has 19 tools (was 13)
- Status bar shows detailed progress (done, working, open counts)

## [1.0.1] - 2026-02-17

Info panel now follows the design philosophy: zero cognitive load.

### Changed
- Info panel is now fully read-only — gate and cursor forms removed (AI manages these via MCP)

### Improved
- Security policy updated for v1.0.x

## [1.0.0] - 2026-02-17

First stable release. Plan review for AI-assisted coding.

### Added
- Gates, checkpoints, and plan cursor are now visible in the review panel
- Info panel: view gates, cursor position, and checkpoint history (read-only, zero cognitive load)
- Enhanced status bar showing resolved count, gate status, and cursor step
- Expanded FAQ and use-case documentation

### Fixed
- Annotations could be counted twice in status summaries
- Memo positions could drift after repeated document saves

### Improved
- MCP server now has 13 documented tools (added respond_to_memo)
- README rewritten with design philosophy and structured FAQ
- llms.txt expanded for AI engine discoverability

## [0.9.9] - 2026-02-17

Highlights no longer vanish after save/reload.

### Fixed
- Highlights disappeared after switching tabs, reopening files, or scrolling through the document
- Only memo cards survived save/reload — the colored highlight on the text itself was lost
- Backslashes and strange characters could appear in highlighted text after repeated saves

## [0.9.8] - 2026-02-16

Pre-launch stability pass — fixes data corruption bugs and improves reliability.

### Fixed
- AI responses could corrupt existing annotations when multiple responses exist in a document
- Memo text with line breaks was lost after save/reload
- Rapid annotation creation by AI agents could produce duplicate memo IDs
- Checkpoint detection could silently fail on repeated calls
- MCP Setup screen showed misleading "Step 1 of 2" label
- `Show Onboarding` command was not visible in the command palette

### Improved
- Internal docs removed from published package (smaller install size)

## [0.9.7] - 2026-02-16

Stabilization release with bug fixes and a new MCP tool for AI agents.

### Added
- New `respond_to_memo` MCP tool — AI agents can now write responses directly into your review

### Fixed
- Annotation deletion could target the wrong element when removing a highlight with its memo
- Memo placement edge case when annotating inside tables

## [0.9.6] - 2026-02-16

AI auto-manages memo statuses. Simplified from 4 states to 3.

### Added
- Memos with AI responses are automatically marked as "Answered"
- AI Response blocks now collapse/expand for long responses

### Fixed
- Backslash characters appearing when annotating AI response content

### Improved
- AI Response blocks now match the memo card design (card style, hover effects, themed colors)
- Simplified memo status: Open, Answered, Won't Fix (removed redundant "Done")

### Changed
- Memo status model reduced from 4 to 3 states (existing "Done" memos auto-migrate to "Answered")

## [0.9.5] - 2026-02-16

Bug fixes and quality improvements toward the first stable release.

### Added
- AI responses now appear directly in the review panel
- You can annotate on top of AI responses

### Fixed
- First memo disappearing without being saved
- Annotations not recognized after MCP server updates
- Checkpoints lost during session handoff
- Inaccurate annotation placement when the same text appears multiple times

### Improved
- Memo format compatibility
- Test coverage expanded (51 tests)

## [0.9.4] - 2026-02-15

Initial public release.

### Added
- VS Code Extension: Markdown annotation UI (Fix / Question / Highlight)
- MCP Server: 12 tools for annotations, checkpoints, handoff, and export
- Export support for 11 AI coding tools
- Keyboard shortcuts (1-2-3) for quick annotation
