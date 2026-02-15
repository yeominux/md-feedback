# Changelog

All notable changes to MD Feedback will be documented in this file.

## [0.9.3] — 2026-02-15

### Changed
- All public links updated to canonical repository (yeominux/md-feedback)
- MCP server README and npm metadata aligned with public product naming
- Marketplace README links converted to absolute URLs for correct rendering

## [0.9.2] — 2026-02-15

### Fixed
- Memo visibility hardening: legacy hex memo colors are normalized so saved memos always render as cards in the panel
- Memo persistence fallback now uses memo ID checks (not count-only), preventing UI dropouts when markdown serialization misses memo blocks

### Changed
- Public-facing copy and package metadata refined for clearer product positioning on GitHub, npm, and Marketplace surfaces

## [0.9.1] — 2026-02-15

### Fixed
- Release hardening: tag-to-version verification now blocks mismatched package versions before publish
- Artifact hygiene: release workflow now validates the VSIX filename matches the git tag version

### Changed
- Release pipeline concurrency guard added to avoid overlapping duplicate release jobs

## [0.9.0] — 2026-02-15

### Fixed
- **Memo save bug**: Enter now saves memo (was Ctrl+Enter), Shift+Enter for newline
- **Memo text trimming**: Newlines in memo text no longer cause split-line comment bugs on reload
- **Split-line v0.3 memo parsing**: Parser now handles legacy multi-line memo format
- **Highlight text visibility**: Text inside highlights now readable in all themes with proper color overrides
- **Theme switching**: Light/dark mode toggle now works correctly via `theme.update` handler

### Removed
- MetadataDrawer UI — Gates and Cursor are now MCP-only features (no user-facing forms)

## [0.8.0] — 2026-02-14

### Changed
- **Refined product visual design**: Paper-style light theme, tighter typography (line-height 1.5, heading letter-spacing), and 4px border-radius for improved readability
- **Simplified toolbar**: Clean SVG icons replace emoji buttons, reduced visual clutter
- **Light-only theme**: Always renders in clean paper theme regardless of VS Code settings
- **MCP-first Agent Memory**: Gates, Plan Cursor, and Handoff features positioned as MCP capabilities (no more confusing sidebar forms)
- **Snappier interactions**: Removed 200ms blanket transitions, hover responses now instant

### Removed
- Dark mode theme
- Gates/Cursor/Status sidebar UI (available via MCP)
- Buy Me a Coffee link from UI
- Status Summary Bar
- H2 bottom borders, table zebra striping
- Metadata Drawer

### Fixed
- Auto-checkpoint error notifications no longer shown when document is unavailable
- Mermaid diagrams now render correctly in VS Code webview (fixed CSP dynamic import issue)

## [0.7.0] - 2026-02-14

### Changed
- Pro-grade release update: rich markdown rendering, theming improvements, and Agent Memory UX polish.

## [0.6.0] - 2026-02-13

### Added
- Editor rendering upgrades: syntax-highlighted code blocks, callout/admonition blocks, and Mermaid diagram support.

## [0.5.0] - 2026-02-13

### Added
- First packaged VS Code extension release line under the MD Feedback product name.

## [0.4.0] - 2026-02-12

### Added
- Agent-complete review model with structured memo state, gates, and plan cursor support.

## [0.3.0] - 2026-02-12

### Added
- Sidebar panel architecture with low-friction review UX for markdown plans.

## [0.1.0] - 2025-12-04

### Added
- Initial release series foundation for markdown review/export workflows.
