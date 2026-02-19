# MD Feedback

> Review your plan. Guide your AI agent. Ship with confidence.

[English](README.md) | [한국어](README.ko.md)

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/yeominux.md-feedback-vscode?label=VS%20Code&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode) [![npm](https://img.shields.io/npm/v/md-feedback?logo=npm)](https://www.npmjs.com/package/md-feedback) [![License: SUL-1.0](https://img.shields.io/badge/License-SUL--1.0-blue.svg)](./LICENSE) [![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/ymnseon8)

**MD Feedback** is a VS Code extension and MCP server for reviewing markdown plans before AI agents implement them. Annotate plans with Fix, Question, and Highlight — AI agents read your structured feedback directly through MCP. No copy-paste, no export step, no context lost between sessions.

Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode), open a `.md` plan, press `1/2/3`, and your agent can act on that review immediately.

**You review. The agent builds. Gates track completion. Handoffs preserve context.**

![MD Feedback Demo](https://raw.githubusercontent.com/yeominux/md-feedback/main/assets/demo.gif)

> Latest (v1.3.1): highlight persistence, needs-review sync, and approve/reject UI flow are now stable in real extension usage.

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
Step 5  YOU        Review AI work → Approve, Request Changes, or Reject
          │
Step 6  AGENT      Gates auto-evaluate
          │         "3 fixes remaining" → "All done, ready to merge"
          │
Step 7  AGENT      Generates handoff → next session picks up where you left off
```

You do steps 1–2 and 5. The agent does the rest.

This is the MCP-first path. If you use export-based workflow, run export after step 2.

## Features

- **3 annotation types**: Highlight (reading mark), Fix (needs change), Question (needs clarification)
- **19 MCP tools** for direct agent integration
- **Export to 11 AI tools**: Claude Code, Cursor, Copilot, Codex, Cline, Windsurf, Roo Code, Gemini, Antigravity, Generic, Handoff
- **Quality gates** with automatic pass/fail evaluation
- **Session handoffs** preserve context across AI agent sessions
- **Checkpoints** track review progress with snapshots
- **Plan cursor** tracks current position in a document
- **Keyboard shortcuts**: press 1, 2, 3 for instant annotation
- **AI applies fixes** via MCP — agent reports implementations, you see inline before/after diffs
- **7 status badges**: Open, Working, Review, Answered, Done, Failed, Won't Fix
- **Rollback**: agent can undo its last change if something went wrong
- **Batch operations**: multiple fixes applied in one transaction
- **File safety**: blocks writes to .env, credentials, node_modules
- **Approve / Reject buttons** — accept or dismiss annotations inline, always visible when review needed
- **CodeLens in editor** — approve or reject directly in the markdown file, no sidebar needed
- **Activity Bar badge** — see pending review count at a glance
- **Status bar + toast notifications** — never miss when AI delivers work for review
- **Keyboard shortcuts** — Ctrl+Shift+A to approve, Ctrl+Shift+X to reject
- **Gate override** — manually control gate status when auto-evaluation isn't enough
- **External file diffs inline** — see exactly what AI will change before applying
- **Gate transition notifications** — know when gates unblock or complete
- **File mutex** — prevents data corruption from concurrent MCP tool calls
- **Auto-refresh**: document updates in real-time when AI writes changes
- **Portable format**: annotations stored as HTML comments — works in any markdown renderer, survives git
- **Rich rendering**: Mermaid diagrams, callout blocks, syntax-highlighted code

## Quick Start (under 2 minutes)

1. **Install** from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)
2. **Connect MCP** — add to your AI tool config (Claude Code, Cursor, etc.):

```json
{ "mcpServers": { "md-feedback": { "command": "npx", "args": ["-y", "md-feedback"] } } }
```

3. **Annotate** — open a `.md` file in the sidebar, press `1` (highlight), `2` (fix), `3` (question)
4. **Done** — your agent reads annotations directly via MCP. No export needed.

> **No MCP?** Use Command Palette → `MD Feedback: Export` → pick your AI tool.

> **Try it now:** Install from [Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode), open any `.md` file, and press `2` to add your first Fix annotation.

## Use Cases

### Vibe Coding Workflow
Write a plan in markdown. Review it with MD Feedback. Let your AI agent build exactly what you reviewed. The plan is the contract — annotations are the instructions.

### AI Plan Review
An AI agent generates an implementation plan. You review it with highlights, fixes, and questions before the agent writes any code. Catch errors at design time, not after implementation.

### Session Continuity
Working with AI across multiple sessions? Handoffs preserve every decision, open question, and key context point. The next session starts where the last one ended.

### Team Plan Review
Annotations are HTML comments in the markdown file. They survive git commits, PRs, and branch merges. Share reviewed plans with your team through your normal version control workflow.

### Quality Gate Enforcement
Set conditions that must be met before the agent proceeds. Gates auto-evaluate based on annotation resolution status — blocked, proceed, or done.

## Design Philosophy

- **Humans only state what is wrong.** AI decides how to fix it.
- **Three annotation types are sufficient.** AI infers intent from context — whether a fix means a document edit or a code change.
- **Markdown is the source of truth.** All state lives in the file itself.
- **Zero cognitive load.** Status bar shows progress passively. No extra decisions required.
- **Portable and git-friendly.** Annotations are HTML comments — they survive any markdown renderer and version control.

## VS Code Settings

You can tune timing behavior from **Settings** (`md-feedback.*`):

- `md-feedback.autoCheckpointIntervalMs` (default: `600000`)
- `md-feedback.sectionTrackDebounceMs` (default: `3000`)
- `md-feedback.editorSwitchDebounceMs` (default: `150`)
- `md-feedback.fileWatchDebounceMs` (default: `500`)

Use larger values if your workspace is very large or you want fewer background updates.

## MCP Server

MD Feedback includes an MCP server with 19 tools that let AI agents read your annotations without manual export. Agents can query memos, mark tasks done, apply fixes, check gate status, and generate handoffs — all through the Model Context Protocol.

**Setup:**

```bash
npx md-feedback
```

**Workspace override** — if your MCP client doesn't set `cwd` to the project folder (e.g. Antigravity), specify it explicitly:

```json
{ "command": "npx", "args": ["-y", "md-feedback", "--workspace=/path/to/project"] }
```

Or via environment variable: `MD_FEEDBACK_WORKSPACE=/path/to/project`

For full details, see [MCP Server documentation](./apps/mcp-server/README.md).

## Shared API Policy

- New integrations should use `MemoV2`-based APIs (`splitDocument`, `extractMemosV2`).
- Legacy helpers are compatibility-only and exposed under `legacy.*`.
- Avoid adding new dependencies on deprecated `Memo`-typed flows.

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
MD Feedback is a VS Code extension and MCP server for reviewing markdown plans before AI agents implement them. Select text, press 1 (highlight), 2 (fix), or 3 (question) — annotations are stored as portable HTML comments in the markdown file itself. AI agents read annotations directly via MCP, or you can export to 11 AI tools.

**What is plan review?**
Plan review means reviewing designs and plans before implementation. Unlike code review (after code is written), plan review catches architecture mistakes and missing requirements at the design stage — before any code is produced.

**Does it work with Claude Code / Cursor / Copilot?**
Yes. MD Feedback exports to Claude Code (`CLAUDE.md`), Cursor (`.cursor/rules/`), GitHub Copilot (`.github/copilot-instructions.md`), and 8 more tools. With MCP, agents read annotations directly — no export step needed.

**What is MCP and why does it matter?**
MCP (Model Context Protocol) lets AI agents interact with external tools. MD Feedback's MCP server gives agents direct access to your annotations, so they can read feedback, mark tasks done, evaluate gates, and generate handoffs automatically. For example, when you mark a section as "Fix: use retry logic here," the agent reads that annotation via MCP, implements the fix, and marks it done — all without you switching tabs.

**What is vibe coding?**
Vibe coding is a workflow where you describe what you want in natural language, and an AI agent writes the implementation. MD Feedback adds a structured review step: you review the plan first, annotate problems, and the agent acts on your specific feedback rather than vague instructions.

**How do I preserve context between AI sessions?**
Use the handoff feature. The agent generates a structured handoff document that captures all decisions made, questions answered, fixes applied, and remaining open items. The next session picks up this handoff to continue where you left off.

**What are quality gates?**
Gates are checkpoints that block or allow the agent to proceed based on annotation status. If a gate's required memos are all resolved, it switches to "proceed" or "done." This prevents the agent from moving forward while critical fixes remain unaddressed.

**Can multiple people review the same plan?**
Yes. Annotations are HTML comments embedded in the markdown file. They travel with the file through git — commits, branches, pull requests, and merges all preserve annotations intact.

**Is it free?**
Yes. MD Feedback is free for personal and non-commercial use under the [SUL-1.0](./LICENSE) license.

**Who is this for?**
Developers using AI coding assistants who want to review plans before implementation, preserve context across sessions, and give agents structured feedback instead of unstructured chat messages.

