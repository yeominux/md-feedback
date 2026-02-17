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
