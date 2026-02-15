# md-feedback

> MCP server for markdown annotation review — AI agents read your annotations directly.

[![npm](https://img.shields.io/npm/v/md-feedback)](https://www.npmjs.com/package/md-feedback)
[![License: SUL-1.0](https://img.shields.io/badge/License-SUL--1.0-blue.svg)](https://github.com/yeominux/md-feedback-clean/blob/dev/LICENSE)

## What is this?

md-feedback is an [MCP](https://modelcontextprotocol.io/) server that lets AI agents (Claude Code, Cursor, Copilot, etc.) read your markdown review annotations, mark memos done, evaluate quality gates, and generate session handoffs — all automatically.

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

## 12 MCP Tools

| Tool | Description |
|------|-------------|
| `get_document_structure` | Full review state: memos, gates, cursor, sections, summary |
| `list_annotations` | All annotations with type/status/owner/color |
| `get_review_status` | Annotation counts and session status |
| `update_memo_status` | Mark a memo as open/answered/done/wontfix |
| `update_cursor` | Set plan cursor position (task ID, step, next action) |
| `evaluate_gates` | Check if merge/release/implement conditions are met |
| `export_review` | Export for a specific AI tool format |
| `create_checkpoint` | Save review progress |
| `get_checkpoints` | List all checkpoints |
| `generate_handoff` | Generate structured handoff document |
| `pickup_handoff` | Parse existing handoff for session resumption |
| `create_annotation` | Create annotation programmatically |

## How It Works

1. You annotate a markdown plan in the [VS Code extension](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)
2. AI agent reads annotations via MCP — no export needed
3. Agent implements fixes, marks memos done
4. Gates auto-evaluate — agent knows when it's safe to merge
5. Agent generates handoff — next session picks up where you left off

## CLI

```bash
md-feedback --help      # Show help
md-feedback --version   # Print version
md-feedback             # Start MCP server (stdio)
```

## Links

- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)
- [GitHub](https://github.com/yeominux/md-feedback-clean)
- [Documentation](https://github.com/yeominux/md-feedback-clean#readme)

## License

[SUL-1.0](https://github.com/yeominux/md-feedback-clean/blob/dev/LICENSE) — Free for personal and non-commercial use.
