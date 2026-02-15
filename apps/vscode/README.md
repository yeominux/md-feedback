# MD Feedback

[한국어](https://github.com/yeominux/md-feedback-clean/blob/main/README.ko.md)

> Review and annotate markdown plans before your AI agent implements them. You underline what matters, write a memo — the agent gets structured instructions it can act on.

![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue?logo=visual-studio-code)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/yeominux.md-feedback-vscode?label=VS%20Code&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/ymnseon8)
[![License: SUL-1.0](https://img.shields.io/badge/License-SUL--1.0-blue.svg)](./LICENSE)

MD Feedback is a VS Code extension and MCP server that lets developers visually annotate markdown plans with highlights, fixes, and questions before AI coding agents implement them. Annotations are stored as portable HTML comments in the markdown file — no proprietary format, no server required. Export to Claude Code, Cursor, GitHub Copilot, and 8 more tools, or let agents read annotations directly via MCP. You stay in control.

## Why

You write a plan in markdown. Your AI agent — Claude Code, Cursor, Copilot, or any other tool — implements it. But the agent doesn't know which parts you've reviewed, what you want changed, or what questions remain.

Without MD Feedback, you copy-paste snippets into chat, lose track of what's addressed, and repeat yourself across sessions. With MD Feedback, you annotate the plan once, export, and the agent receives structured feedback.

**Before**: You paste "change the auth to OAuth2" into chat. The agent has no context — which section? is it a blocker?

**After**: You select "authentication should use JWT", press `2` (fix), write "Use OAuth2 instead". Export to Claude Code. The agent reads `CLAUDE.md` and sees:

```
### Must Fix
- "authentication should use JWT" → Use OAuth2 instead
```

## How It Works

From plan to implementation — the full AI coding loop:

```
Step 1  YOU      Write a plan in markdown
         │
Step 2  YOU      Open in MD Feedback sidebar → highlight, fix, question
         │       (press 1, 2, or 3)
         │
Step 3  AGENT    Reads annotations via MCP — no export step needed
         │
Step 4  AGENT    Implements fixes, answers questions
         │
Step 5  AGENT    Marks memos done → gates auto-evaluate
         │       "3 fixes remaining" → "All done, ready to merge"
         │
Step 6  AGENT    Generates handoff → next session picks up where you left off
```

You do steps 1–2. The agent does the rest.

This is the MCP-first path. If you prefer export-based workflow, run export after step 2.

## Quick Start

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)
2. Click the **MD Feedback** icon in the Activity Bar (left sidebar)
3. Open any `.md` file — it renders in the sidebar panel
4. Select text, press `1` (highlight), `2` (fix), or `3` (question)
5. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → search **MD Feedback: Export** → pick your AI tool, done
   Or skip export entirely — if you use the MCP server, your agent reads annotations directly.

## Features

- **3 annotation types**: Highlight (yellow marker), Fix (red strikethrough + memo), Question (blue wavy underline + memo)
- **Rich markdown rendering**: Mermaid diagrams, callout blocks (NOTE, TIP, IMPORTANT, WARNING, CAUTION), syntax-highlighted code blocks
- **Export to 11+ AI tools**: Each export saves the config file **and** copies a ready-to-paste prompt to your clipboard
- **Memo status tracking**: Every memo has a status (`open` / `answered` / `done` / `wontfix`) and owner (`human` / `agent`)
- **Checkpoints**: Save review progress snapshots — manually via Command Palette or automatically
- **Keyboard-first**: `1` highlight, `2` fix, `3` question — no mouse needed

## MCP Server — Agent Memory

Without MCP, you export annotations to a file and the agent reads it. With MCP, the agent reads your annotations directly, marks memos done, evaluates gates, and generates handoffs — all automatically.

```
You annotate plan.md
        |
AI reads annotations via MCP    ← no export step needed
        |
AI implements fix
        |
AI marks memo "done" via MCP    ← no manual status update
        |
AI evaluates gates → "ready to merge"
```

### Setup (one command)

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

### What MCP Enables

| Feature | Without MCP | With MCP |
|---------|-------------|----------|
| **Read annotations** | Export to file, agent reads file | Agent reads directly |
| **Mark memos done** | Manual status updates | Agent updates automatically |
| **Gates** | Not available | Define completion conditions — agent knows when it's safe to merge |
| **Plan Cursor** | Not available | Agent tracks position across sessions — no repeated work |
| **Handoff** | Not available | Agent generates structured handoff for the next session |

<details>
<summary>12 MCP tools</summary>

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
| `create_annotation` | Create annotation programmatically (highlight, fix, or question) |

</details>

## Supported AI Tools

| Tool | Config File | Auto-loaded |
|------|------------|-------------|
| Claude Code | `CLAUDE.md` | Yes |
| Cursor | `.cursor/rules/plan-review.mdc` | Yes |
| OpenAI Codex | `AGENTS.md` | Yes |
| GitHub Copilot | `.github/copilot-instructions.md` | Yes |
| Cline | `.clinerules` | Yes |
| Windsurf | `.windsurfrules` | Yes |
| Roo Code | `.roo/rules/plan-review.md` | Yes |
| Gemini | `.gemini/styleguide.md` | Yes |
| Antigravity | `.agent/rules/plan-review.md` | Yes |
| Generic | Timestamped `.md` file | Works with any tool |
| Handoff | `HANDOFF.md` | Session continuity document |

<details>
<summary>Commands</summary>

All commands available via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `MD Feedback: Create Checkpoint` | Save review progress checkpoint |
| `MD Feedback: Export: All Tools` | Write all context files at once |
| `MD Feedback: Export: Claude Code` | `CLAUDE.md` |
| `MD Feedback: Export: Cursor` | `.cursor/rules/plan-review.mdc` |
| `MD Feedback: Export: Codex` | `AGENTS.md` |
| `MD Feedback: Export: GitHub Copilot` | `.github/copilot-instructions.md` |
| `MD Feedback: Export: Cline` | `.clinerules` |
| `MD Feedback: Export: Windsurf` | `.windsurfrules` |
| `MD Feedback: Export: Roo Code` | `.roo/rules/plan-review.md` |
| `MD Feedback: Export: Gemini` | `.gemini/styleguide.md` |
| `MD Feedback: Export: Antigravity` | `.agent/rules/plan-review.md` |
| `MD Feedback: Export: Generic Markdown` | Clipboard + timestamped file |
| `MD Feedback: Export: Handoff Document` | `HANDOFF.md` |

</details>

<details>
<summary>Keyboard Shortcuts</summary>

| Shortcut | Action |
|----------|--------|
| `1` | Highlight selected text (yellow) |
| `2` | Mark as Fix (red strikethrough + memo card) |
| `3` | Mark as Question (blue underline + memo card) |
| `Enter` | Save memo |
| `Esc` | Cancel memo |
| Click annotation | Remove it |

</details>

<details>
<summary>Annotation Format</summary>

Annotations are stored as HTML comments in your markdown — no proprietary format, fully portable:

```html
<!-- USER_MEMO id="abc123" color="red" status="done" : Use OAuth2 instead of JWT -->
```

| Field | Values | Description |
|-------|--------|-------------|
| `status` | `open` / `answered` / `done` / `wontfix` | Workflow state |
| `type` | `fix` / `question` / `highlight` | Derived from color |
| `owner` | `human` / `agent` / `tool` | Who is responsible |

</details>

---

## Who Is This For?

- **Developers using AI coding assistants** (Claude Code, Cursor, Copilot, etc.) who want to review plans before implementation
- **Teams practicing vibe coding** who need structured context continuity across sessions
- **Anyone who writes or receives markdown plans** before AI generates code

---

## FAQ

**What is MD Feedback?**
MD Feedback is a VS Code extension and MCP server for reviewing AI-generated plans before implementation. Select text, press 1 (highlight), 2 (fix), or 3 (question) — annotations are stored as portable HTML comments in the markdown file itself. Export to 11+ AI tools or let agents read directly via MCP.

**How is this different from Markdown Preview Enhanced?**
Markdown Preview Enhanced is a read-only renderer. MD Feedback is an interactive review tool — you annotate plans with structured feedback that AI agents can act on.

**Does it work with Claude Code / Cursor / Copilot?**
Yes. MD Feedback exports to Claude Code (`CLAUDE.md`), Cursor (`.cursor/rules/`), GitHub Copilot (`.github/copilot-instructions.md`), and 8 more tools. With MCP, agents read annotations directly — no export step needed.

**What is MCP and why does it matter?**
MCP (Model Context Protocol) lets AI agents interact with external tools. MD Feedback's MCP server gives agents direct access to your annotations — they can read feedback, mark tasks done, evaluate gates, and generate handoffs automatically.

**Is it free?**
Yes. MD Feedback is free for personal and non-commercial use under the [SUL-1.0](./LICENSE) license.

**What is plan review?**
Plan review is the practice of reviewing an AI-generated plan before implementation. Unlike code review (which happens after code exists), plan review catches architectural mistakes and requirement gaps at the design stage — before any code is written.

---

## License

[SUL-1.0](./LICENSE) — Free for personal and non-commercial use.
