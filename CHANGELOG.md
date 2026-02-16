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
