# Changelog

## [1.5.3] - 2026-02-22

### Fixed
- Selecting multiple paragraphs for a single highlight no longer creates separate annotations for each paragraph — they are now merged into one annotation as intended

## [1.5.2] - 2026-02-22

### Fixed
- Long paragraph Fix/Question annotations no longer spawn multiple `memo_recovered_*` entries from fragment-level highlights when a real memo already exists.
- Highlight serialization now merges same-color fragments per text block, reducing noisy `HIGHLIGHT_MARK` fan-out in saved markdown.

## [1.5.1] - 2026-02-21

### Changed
- Large review metadata is now stored in a sidecar file instead of repeating inside markdown body blocks, keeping review documents easier to read.

### Fixed
- MCP document mutation and query tools now use a single sidecar-aware runtime path, reducing inconsistent behavior between tools.
- VS Code document sync now reloads sidecar metadata consistently, including updates triggered by `.md-feedback/metadata.json` changes.
- Existing sidecar data from older versions is still recognized for compatibility while new saves use the current format.
- Comment-integrity safeguards and anchor-confidence regressions are covered by expanded automated tests to prevent repeat corruption issues.
- Focused test filtering commands are now stable with Vitest v4 name matching (`-t`) for reliable evidence-based verification.

## [1.5.0] - 2026-02-21

### Added
- **Approve All**: New status bar button to bulk-approve all pending review annotations in one click
- Annotations with uncertain anchor positions now show a warning icon so you can verify placement

### Fixed
- Annotation text containing quotes, ampersands, or special characters no longer gets corrupted after saving
- All annotation metadata (type, owner, source, timestamps) is now preserved when editing in the review panel
- AI agent batch operations no longer corrupt each other when multiple changes target the same document
- AI agent rollback now correctly reverts only the intended change instead of all matching text
- AI agent responses no longer shift out of position when multiple responses exist in the same document
- Orphaned annotations (with broken anchor references) now appear at the end of the document instead of the top
- Duplicate "recovered" annotations no longer appear when the AI edits both the anchor text and the annotation
- Stale recovered annotations left over from previous sessions are now automatically cleaned up when you reopen the document
- Annotation ordering is now deterministic, reducing unnecessary changes in version control
- The review panel now asks for confirmation before discarding unsaved edits when the file changes externally
- Backslash escaping now handles additional markdown characters correctly
- File locking no longer gets stuck when a previous operation was interrupted

### Improved
- Progress indicator now shows both applied and resolved counts for clearer status tracking

## [1.4.2] - 2026-02-21

### Changed
- **Finalize Document** replaces "Copy clean markdown" — the button now saves the cleaned document directly to the file (removing all annotations, checkpoints, and metadata) instead of copying to clipboard

### Fixed
- Webview now reflects external file changes (e.g. from AI agent tools) in near real-time instead of requiring a panel toggle to refresh
- Duplicate memos no longer accumulate at the bottom of a document after repeated save/load cycles
- Backslash characters no longer double on every editor round-trip (e.g. `C:\folder` stays `C:\folder` instead of becoming `C:\\folder`)
- Memo positions remain stable across save/load cycles when the document is edited around them

## [1.4.1] - 2026-02-21

### Changed
- Updated demo video to accurately reflect the latest review card design, approval flow, and progress tracking

### Fixed
- Clicking a memo in the Details drawer now correctly scrolls to the memo card in the editor

## [1.4.0] - 2026-02-21

### Added
- **Annotation type switching**: Click the type badge on any memo card to convert between Fix, Question, and Highlight — the highlight color updates automatically
- **Clean Copy**: New status bar button strips all annotations and metadata, copies clean markdown to your clipboard
- **Workflow Prompt**: New status bar button generates a context-aware instruction summary for your AI agent based on current review progress
- Annotation menu now shows tooltips explaining what each type (Fix, Question, Highlight) is for
- Memos in Open status can now be moved to In Progress directly from the status dropdown

### Changed
- Details drawer redesigned with a large progress percentage, color-coded progress bar, phase and gate indicators, and grouped memo list with click-to-navigate
- Memo card header now uses a clickable type badge with dropdown menu instead of a static dot
- Updated demo to reflect the new review card design and progress tracking

### Fixed
- Copying memo text no longer includes unintended formatting artifacts
- Resolved percentage in status bar no longer double-counts completed memos

## [1.3.20] - 2026-02-20

### Added
- Details drawer now shows a progress bar for quick visual status of your review
- Clicking a task in the Details drawer scrolls to that memo and highlights it briefly
- One-step MCP project config file (`.mcp.json`) included for easier agent setup on Windows

### Changed
- "Plan Cursor" section renamed to "Current Task" with human-readable memo text
- Task descriptions now show quoted memo text instead of technical IDs
- Auto-checkpoints are collapsed by default — only named checkpoints are shown
- Checkpoint stats show only relevant counts (e.g. "2 fix" instead of "2 fix · 0 Q · 0 HL")
- Gate override controls moved behind a "More..." button to reduce clutter

### Improved
- Annotations now anchor correctly even when text contains bold, blockquotes, or escape characters
- Drawer toggle buttons now include accessibility labels for screen readers

### Fixed
- Workflow phase names with underscores (e.g. "root_cause") now display as "Root Cause" everywhere

## [1.3.19] - 2026-02-20

### Improved
- AI agents can now scope text replacements to a single heading section, preventing unintended changes elsewhere in the document
- Annotations stay anchored to their intended location more reliably in documents with unusual formatting

## [1.3.18] - 2026-02-20

### Improved
- When the same text appears in multiple places, AI agents must now specify which occurrence to change — preventing accidental edits to the wrong line

## [1.3.17] - 2026-02-20

### Improved
- Annotations stay attached to the correct lines more reliably when similar text appears in multiple places

### Fixed
- Some annotations could drift to the end of the document after saving — now they stay in place
- Special characters in annotation text are preserved correctly across save and reload

## [1.3.16] - 2026-02-20

### Added
- Find annotated markdown files in your workspace without opening them manually
- VS Code walkthrough guides you through creating your first annotation
- Extension now activates automatically when VS Code starts
- Details drawer shows counts of resolved, in-progress, and blocking annotations at a glance

### Changed
- Status bar redesigned with a progress indicator and color-coded gate dots
- Approval flow now uses a focused dialog instead of an inline sidebar form
- Memo cards use a cleaner two-row layout with colored status dot and inline editing
- Details drawer header updated to "Details" with a live status summary
- Onboarding starts with annotation first; MCP setup is optional
- Onboarding banner now mentions keyboard shortcuts 1/2/3 alongside click actions
- Demo animation reduced by 41% in file size for faster loading

### Improved
- Deleting an annotation now requires a brief hold to prevent accidental removal
- Status menu supports arrow-key navigation, Enter to select, and Escape to dismiss
- Interactive buttons now have a subtle press animation for tactile feedback

### Fixed
- AI text replacements are now safer by default — single-occurrence replacement prevents unintended changes
- Errors during batch operations are now reported instead of silently ignored
- Concurrent AI operations no longer risk corrupting your document

## [1.3.15] - 2026-02-20

### Fixed
- Annotations on headings no longer create duplicate entries after document reload

## [1.3.14] - 2026-02-20

### Added
- When rejecting an AI change, you can now provide a reason — the agent reads it to avoid repeating the same mistake
- MCP tool reference in documentation now lists all 26 tools

## [1.3.13] - 2026-02-20

### Fixed
- "Approve Action" button now enables immediately after all memos are approved — previously required a manual reload

## [1.3.12] - 2026-02-20

### Fixed
- "Approve Action" button now works correctly on Windows — previously the button appeared but clicking it did nothing

## [1.3.11] - 2026-02-19

### Fixed
- "Approve Action" button no longer disappears intermittently on Windows

## [1.3.10] - 2026-02-19

### Fixed
- "Approve Action" now stays visible even when you click outside the markdown editor

## [1.3.9] - 2026-02-19

### Changed
- "Approve Action" is now always visible when there's a pending approval, even if individual memo reviews are still in progress
- When reviews are still pending, "Approve Action" shows a tooltip guiding you to resolve reviews first

### Improved
- Extension now shows a one-time notice explaining that VS Code extension and npm MCP server are updated separately, with quick-copy commands for each

## [1.3.8] - 2026-02-19

### Changed
- Approval flow is clearer: checkpoint approval and memo approval are shown as separate actions
- Removed duplicate approve button that could cause confusion
- Demo updated to match the current approval flow

## [1.3.7] - 2026-02-19

### Fixed
- New memo cards no longer disappear if you click away before typing — accidental deletion is prevented
- AI agents can now reliably target annotations that were recovered from a previous session

## [1.3.6] - 2026-02-19

### Improved
- Privacy policy included — confirms no data is collected
- Code of conduct added for community contributors
- Marketplace listing now shows a changelog tab
- Demo animation includes alt text for screen reader accessibility
- MD Feedback is free for personal and non-commercial use (now stated explicitly in Marketplace)
- VS Code Marketplace and npm listings now link to each other for easier discovery
- VS Code category changed to "Linters" for better Marketplace browsing

## [1.3.5] - 2026-02-19

### Fixed
- AI responses no longer drift to the end of the document after text replacements
- Annotation positions stay stable across repeated save cycles
- Approval flow now works reliably when AI applies multiple fixes and responds to questions in sequence

### Improved
- Timing behavior for large documents is now configurable via VS Code settings:
  `md-feedback.autoCheckpointIntervalMs`,
  `md-feedback.sectionTrackDebounceMs`,
  `md-feedback.editorSwitchDebounceMs`,
  `md-feedback.fileWatchDebounceMs`

## [1.3.4] - 2026-02-19

### Fixed
- AI responses no longer drift to the end of the document after text replacements
- Annotation positions stay stable across repeated save cycles

## [1.3.3] - 2026-02-18

### Changed
- AI agents can no longer mark annotations as Done, Answered, or Failed on their own — these final statuses now require your approval through the editor

## [1.3.2] - 2026-02-18

### Fixed
- Demo now correctly shows approval happening in the editor, not the sidebar

## [1.3.1] - 2026-02-18

Human review loop is now stable in the actual VS Code UI.

### Fixed
- Highlights now persist after save and reload
- AI-delivered review items now appear reliably as "Needs Review" in the UI
- Approve/Reject flow now syncs consistently between AI updates and the extension UI
- Syntax highlighting inside code blocks renders correctly again in the review panel

### Improved
- Demo updated to match the current editor-first review experience

## [1.3.0] - 2026-02-18

More reliable experience in real projects.

### Fixed
- Better workspace detection for MCP clients that don't start in the project folder
- Review status updates reflect more reliably during active editing

## [1.2.1] - 2026-02-18

Review from your editor — no sidebar needed.

### Added
- CodeLens in editor — approve or reject annotations directly in the markdown file
- Activity Bar badge — pending review count visible at a glance
- Status bar indicator — persistent review count in VS Code's bottom bar
- Toast notifications — get notified when AI delivers work for review
- Keyboard shortcuts — Ctrl+Shift+A to approve, Ctrl+Shift+X to reject

### Improved
- Approve/Reject buttons are now always visible on annotations needing review (no hover required)

## [1.2.0] - 2026-02-18

Human control over AI work — approve, reject, override, and see what changes before they happen.

### Added
- Review status — AI work lands in "Needs Review" state; you approve or reject after seeing what changed
- Approve / Reject buttons on annotations — one click to accept or dismiss AI work
- CodeLens in editor — approve or reject directly from the markdown file, no sidebar needed
- Activity Bar badge — see how many annotations need review at a glance
- Status bar indicator — persistent review count in VS Code's bottom bar
- Toast notifications — get notified when AI delivers work for review
- Keyboard shortcuts — Ctrl+Shift+A to approve, Ctrl+Shift+X to reject nearest annotation
- Gate override — manually set gate status from the metadata drawer
- External file diffs — see exactly what AI will create or change before applying
- Gate transition notifications — know when gates unblock or complete

### Improved
- Annotations stick to their intended location more reliably

## [1.1.1] - 2026-02-17

### Added
- Animated demo showing the full annotation and review flow

### Improved
- Security policy updated

## [1.1.0] - 2026-02-17

AI agents can now apply fixes, track progress, and roll back changes — all through MCP.

### Added
- AI can apply fixes to your document and create files (with dry-run preview)
- Multiple fixes can be applied at once in a single batch
- AI can roll back its last change if something went wrong
- Progress tracking shows what the AI is working on
- See implementation history for each annotation
- Link source files to annotations
- Inline before/after diffs shown directly on memo cards
- 6 status badges with color coding: Open, Working, Answered, Done, Failed, Won't Fix
- File safety checks prevent writing to sensitive files (.env, credentials, node_modules)
- Document auto-refreshes when AI writes changes

### Improved
- MCP server now has 19 tools (was 13)
- Status bar shows detailed progress (done, working, open counts)

## [1.0.1] - 2026-02-17

Info panel now follows the design philosophy: zero cognitive load.

### Changed
- Info panel is now fully read-only — AI manages gates and cursor via MCP

## [1.0.0] - 2026-02-17

First stable release. Plan review for AI-assisted coding.

### Added
- Gates, checkpoints, and plan cursor visible in the review panel
- Info panel: view gates, cursor position, and checkpoint history at a glance
- Enhanced status bar showing resolved count, gate status, and cursor step
- Expanded FAQ and use-case documentation

### Fixed
- Annotations could be counted twice in status summaries
- Annotation positions could drift after repeated saves

### Improved
- MCP server now has 13 documented tools
- README rewritten with design philosophy and structured FAQ

## [0.9.9] - 2026-02-17

Highlights no longer vanish after save/reload.

### Fixed
- Highlights disappeared after switching tabs, reopening files, or scrolling
- Only memo cards survived save/reload — the colored highlight on the text was lost
- Strange characters could appear in highlighted text after repeated saves

## [0.9.8] - 2026-02-16

Stability improvements — fixes data corruption bugs.

### Fixed
- AI responses could corrupt existing annotations when multiple responses exist in a document
- Memo text with line breaks was lost after save/reload
- Rapid annotation creation could produce duplicate entries
- Checkpoint detection could silently fail on repeated calls
- MCP Setup screen showed misleading "Step 1 of 2" label
- "Show Onboarding" command was not visible in the command palette

### Improved
- Smaller install size (development-only docs removed from published package)

## [0.9.7] - 2026-02-16

Stability improvements and a new way for AI to respond to your annotations.

### Added
- AI agents can now write responses directly into your review annotations

### Fixed
- Deleting a highlight could accidentally remove the wrong annotation
- Annotation placement issue when annotating inside tables

## [0.9.6] - 2026-02-16

AI auto-manages annotation statuses. Simplified from 4 states to 3.

### Added
- Annotations with AI responses are automatically marked as "Answered"
- AI Response blocks now collapse/expand for long responses

### Fixed
- Backslash characters appearing when annotating AI response content

### Improved
- AI Response blocks now match the memo card design
- Simplified status model: Open, Answered, Won't Fix (removed redundant "Done")

### Changed
- Status model reduced from 4 to 3 states (existing "Done" annotations auto-migrate to "Answered")

## [0.9.5] - 2026-02-16

Bug fixes and quality improvements toward the first stable release.

### Added
- AI responses now appear directly in the review panel
- You can annotate on top of AI responses

### Fixed
- First annotation disappearing without being saved
- Annotations not recognized after MCP server updates
- Checkpoints lost during session handoff
- Inaccurate annotation placement when the same text appears multiple times

## [0.9.4] - 2026-02-15

Initial public release.

### Added
- VS Code Extension: Markdown annotation UI (Fix / Question / Highlight)
- MCP Server: 12 tools for annotations, checkpoints, handoff, and export
- Export support for 11 AI coding tools
- Keyboard shortcuts (1-2-3) for quick annotation
