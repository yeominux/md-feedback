# MD Feedback

> Review your plan. Guide your AI agent. Ship with confidence.

[English](README.md) | [한국어](README.ko.md)

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/yeominux.md-feedback-vscode?label=VS%20Code&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode) [![npm](https://img.shields.io/npm/v/md-feedback?logo=npm)](https://www.npmjs.com/package/md-feedback) [![License: SUL-1.0](https://img.shields.io/badge/License-SUL--1.0-blue.svg)](./LICENSE) [![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/ymnseon8)

**MD Feedback** is a VS Code plan-review tool for AI coding: annotate markdown with Fix/Question/Highlight, then let agents read and execute that feedback through MCP. Annotations are saved as portable HTML comments in your markdown file (no proprietary format, no cloud lock-in).

Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode), open a `.md` plan, press `1/2/3`, and your agent can act on that review immediately.

**You review. The agent builds. Gates track completion. Handoffs preserve context.**

## How It Works

From plan to implementation, the complete AI coding loop:

```plaintext
Step 1  YOU        Write a plan in markdown
          │
Step 2  YOU        Open in MD Feedback sidebar → highlight, fix, question
          │         (press 1, 2, or 3)
          │
Step 3  AGENT      Reads annotations via MCP — no export step needed
          │
Step 4  AGENT      Implements fixes, answers questions
          │
Step 5  AGENT      Marks memos done → gates auto-evaluate
          │         "3 fixes remaining" → "All done, ready to merge"
          │
Step 6  AGENT      Generates handoff → next session picks up where you left off
```

You do steps 1–2. The agent does the rest.

This is the MCP-first path. If you use export-based workflow, run export after step 2.

## Quick Start

1. **Install** from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)
2. **Connect MCP** — add to your AI tool config (Claude Code, Cursor, etc.):

```json
{ "mcpServers": { "md-feedback": { "command": "npx", "args": ["-y", "md-feedback"] } } }
```

3. **Annotate** — open a `.md` file in the sidebar, press `1` (highlight), `2` (fix), `3` (question)
4. **Done** — your agent reads annotations directly via MCP. No export needed.

> **No MCP?** Use Command Palette → `MD Feedback: Export` → pick your AI tool.

## MCP Server

MD Feedback includes an MCP server that lets AI agents read your annotations without manual export. Agents can query memos, mark tasks done, check gate status, and generate handoffs — all through the Model Context Protocol.

**Setup:**

```bash
npx md-feedback
```

For full details, see [apps/vscode/README.md#mcp-server--agent-memory](./apps/vscode/README.md#mcp-server--agent-memory).

## Packages

| Package | Description | Published |
| --- | --- | --- |
| [apps/vscode](./apps/vscode) | VS Code Extension | [Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode) |
| [apps/mcp-server](./apps/mcp-server) | MCP Server | [npm](https://www.npmjs.com/package/md-feedback) |
| [packages/shared](./packages/shared) | Shared types & utils | Private |

## Links

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)
- [npm (MCP Server)](https://www.npmjs.com/package/md-feedback)
- [Report Issues](https://github.com/yeominux/md-feedback/issues)
- [Contributing](./CONTRIBUTING.md)
- [Sponsor](https://buymeacoffee.com/ymnseon8)

## License

[SUL-1.0](./LICENSE) — Free for personal and non-commercial use.

---

## FAQ

**What is MD Feedback?**
MD Feedback is a VS Code extension and MCP server for reviewing AI-generated plans before implementation. Select text, press 1 (highlight), 2 (fix), or 3 (question) — annotations are stored as portable HTML comments in the markdown file itself. Export to 11+ AI tools or let agents read directly via MCP.

**How is this different from Markdown Preview Enhanced?**
Markdown Preview Enhanced is a read-only renderer. MD Feedback is an interactive review tool — you annotate plans with structured feedback that AI agents can act on.

**Does it work with Claude Code / Cursor / Copilot?**
Yes. MD Feedback exports to Claude Code (`CLAUDE.md`), Cursor (`.cursor/rules/`), GitHub Copilot (`.github/copilot-instructions.md`), and 8 more tools. With MCP, agents read annotations directly — no export step needed.

**What is MCP and why does it matter?**
MCP (Model Context Protocol) lets AI agents interact with external tools. MD Feedback's MCP server gives agents direct access to your annotations, so they can read feedback, mark tasks done, evaluate gates, and generate handoffs automatically.

**Is it free?**
Yes. MD Feedback is free for personal and non-commercial use under the [SUL-1.0](./LICENSE) license.

**Who is this for?**
Developers using AI coding assistants (Claude Code, Cursor, Copilot, etc.) who want to review plans before implementation, preserve context across sessions, and give agents structured feedback instead of unstructured chat messages.
