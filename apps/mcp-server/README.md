# md-feedback

> MCP server for markdown annotation review — AI agents read your annotations directly.

[![npm](https://img.shields.io/npm/v/md-feedback)](https://www.npmjs.com/package/md-feedback)
[![License: SUL-1.0](https://img.shields.io/badge/License-SUL--1.0-blue.svg)](https://github.com/yeominux/md-feedback/blob/main/LICENSE)

## What is this?

md-feedback is an [MCP](https://modelcontextprotocol.io/) server that lets AI agents (Claude Code, Cursor, and other MCP-compatible clients) read your markdown review annotations, mark memos done, evaluate quality gates, and generate session handoffs — all automatically.

Copilot users can use MD Feedback via export flow (`.github/copilot-instructions.md`) even when MCP is not enabled.

**This is the MCP server component.** For the VS Code extension, see [MD Feedback on VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode).

## Quick Start

Add to your MCP client config (Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "md-feedback": {
      "command": "npx",
      "args": ["-y", "md-feedback"]
    }
  }
}
```

That's it. No install, no setup — `npx` handles everything.
Prerequisite: Node.js 18+.

**Workspace override** — if your MCP client doesn't set `cwd` to the project folder:

```json
{
  "mcpServers": {
    "md-feedback": {
      "command": "npx",
      "args": ["-y", "md-feedback", "--workspace=/path/to/project"]
    }
  }
}
```

Resolution order: `--workspace=` CLI arg > `MD_FEEDBACK_WORKSPACE` env > `cwd`

Known MCP config file paths:
- Claude Code: `.claude/mcp.json`
- Cursor: `.cursor/mcp.json`

Windows workspace example:
```json
{
  "mcpServers": {
    "md-feedback": {
      "command": "npx",
      "args": ["-y", "md-feedback", "--workspace=C:\\\\work\\\\my-project"]
    }
  }
}
```

## 28 MCP Tools

| Tool | Description |
|------|-------------|
| `get_document_structure` | Full review state: memos, gates, cursor, sections, summary, metrics |
| `get_overview` | Recommended first query: consolidated summary (counts, gates, workflow, blocking memos) |
| `list_documents` | List markdown files in workspace (optionally annotated-only) |
| `list_annotations` | All annotations with type/status/owner/color |
| `get_review_status` | Annotation counts and session status |
| `create_annotation` | Create annotation programmatically with anchor search |
| `respond_to_memo` | Add AI response to an annotation |
| `update_memo_status` | Update a memo status to open/in_progress/needs_review (terminal statuses are VS Code approval path) |
| `update_cursor` | Set plan cursor position (task ID, step, next action) |
| `evaluate_gates` | Check if merge/release/implement conditions are met |
| `export_review` | Export for a specific AI tool format |
| `create_checkpoint` | Save review progress snapshot |
| `get_checkpoints` | List all checkpoints |
| `generate_handoff` | Generate structured handoff document |
| `pickup_handoff` | Parse existing handoff for session resumption |
| `apply_memo` | Apply implementation (`text_replace`, `artifact_text_replace`, `file_patch`, `file_create`) with dry-run |
| `link_artifacts` | Link source files to a memo |
| `update_memo_progress` | Update progress with status and message |
| `rollback_memo` | Rollback the latest implementation for a memo |
| `batch_apply` | Apply multiple operations in a single transaction |
| `get_memo_changes` | Get implementation history and progress for a memo |
| `get_policy_status` | Get current workflow enforcement mode and policy |
| `get_workflow_status` | Get workflow phase, transitions, and pending approvals |
| `get_severity_status` | Get memo severity overrides and unresolved blocking memos |
| `advance_workflow_phase` | Advance to the next workflow phase (scope → root_cause → implementation → verification) |
| `set_memo_severity` | Override a memo's severity (blocking / non_blocking) |
| `request_approval_checkpoint` | Request human approval before a high-risk operation |
| `approve_checkpoint` | Approve a pending approval checkpoint |

## Safety & Reliability

- **File mutex** — concurrent MCP tool calls are serialized per-file, preventing data corruption
- **Improved anchor matching** — annotations find their intended location more reliably, even with multiple matches

## How It Works

1. You annotate a markdown plan in the [VS Code extension](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)
2. AI agent reads annotations via MCP — no export needed
3. Agent implements fixes, marks memos done
4. Gates auto-evaluate — agent knows when it's safe to merge
5. Agent generates handoff — next session picks up where you left off

## CLI

```bash
md-feedback                          # Start MCP server (stdio)
md-feedback --workspace=/path/to/dir # Set workspace root explicitly
md-feedback --version                # Print version
md-feedback --help                   # Show help
```

## Who Is This For?

Developers and team leads who use AI coding agents (Claude Code, Cursor, Copilot) and want to review AI-generated plans before implementation — not after.

## Links

- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)
- [GitHub](https://github.com/yeominux/md-feedback)
- [Documentation](https://github.com/yeominux/md-feedback#readme)

## License

[SUL-1.0](https://github.com/yeominux/md-feedback/blob/main/LICENSE) — Free for personal and non-commercial use.
