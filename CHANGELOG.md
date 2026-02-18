# Changelog

<!--
  Writing rules (keep this comment):
  - Write from the user's perspective. "Add parsing logic" (X) → "AI responses appear in the panel" (O)
  - Avoid technical terms, function names, file names.
  - Describe the result (what the user sees), not the cause (internal implementation).
  - One change per line. Short and clear.
  - Sections: Added, Fixed, Improved, Changed
  - One-line summary answers "why should I update?"
-->

## [1.2.0] - 2026-02-18

Human control over AI work — approve, reject, override, and see what changes before they happen.

### Added
- Review status — AI work lands in "Needs Review" state, you approve or reject after seeing what changed
- Approve / Reject buttons on annotations — one click to accept or dismiss AI work
- Gate override — manually set gate status from the metadata drawer
- External file diffs — see file_create and file_patch content inline before applying
- Gate transition toast — VS Code notification when gates change state
- File mutex — prevents data corruption from concurrent MCP tool calls

### Improved
- Anchor text matching — annotations stick to their intended location more reliably
- Removed unused unknownComments field from document model

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
