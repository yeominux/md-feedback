# MD Feedback

> Review your plan. Guide your AI agent. Ship with confidence.

[English](https://github.com/yeominux/md-feedback/blob/main/README.md) | [한국어](https://github.com/yeominux/md-feedback/blob/main/README.ko.md)

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/yeominux.md-feedback-vscode?label=VS%20Code&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode) [![npm](https://img.shields.io/npm/v/md-feedback?logo=npm)](https://www.npmjs.com/package/md-feedback) [![License: SUL-1.0](https://img.shields.io/badge/License-SUL--1.0-blue.svg)](https://github.com/yeominux/md-feedback/blob/main/LICENSE) [![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/ymnseon8)

**MD Feedback** is a VS Code extension and MCP server for reviewing markdown plans before AI agents implement them. Hierarchy is explicit: follow the markdown plan first, then apply annotation memos through MCP.

Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode), open a `.md` plan, select text, press `1/2/3`, and your agent can act on that review immediately.

**You review. The agent builds. Gates track completion. Handoffs preserve context.**

![MD Feedback Demo: annotating a markdown plan with Fix, Question, and Highlight in the VS Code sidebar, then reviewing AI-applied changes](https://raw.githubusercontent.com/yeominux/md-feedback/main/assets/demo.gif)

> Latest (v1.5.3): multi-paragraph highlights now merge into a single annotation as intended.

## How It Works

From plan to implementation, the complete AI coding loop:

```plaintext
Step 1  YOU        Write a plan in markdown
          │
Step 2  YOU        Open in MD Feedback sidebar → highlight, fix, question
          │         (press 1, 2, or 3)
          │         Fix card: choose Doc or Code preset
          │
Step 3  AGENT      Follows markdown plan via MCP workflow
          │
Step 4  AGENT      Applies annotation memos (fix/question) under that plan
          │
Step 5  YOU        Review AI work → Approve, Request Changes, or Reject
          │
Step 6  AGENT      Gates auto-evaluate
          │         "3 fixes remaining" → "All done, ready to merge"
          │
Step 7  AGENT      Generates handoff → next session picks up where you left off
```

You do steps 1–2 and 5. The agent does the rest.

MCP is required for the implementation workflow. Export/Share is optional handoff/interoperability only, not an implementation path.

## Features

- **3 annotation types**: Highlight (reading mark), Fix (needs change), Question (needs clarification)
- **28 MCP tools** for direct agent integration
- **Optional share/interop export to 11 AI tools**: Claude Code, Cursor, Copilot, Codex, Cline, Windsurf, Roo Code, Gemini, Antigravity, Generic, Handoff
- **Quality gates** with automatic pass/fail evaluation
- **Session handoffs** preserve context across AI agent sessions
- **Checkpoints** track review progress with snapshots
- **Plan cursor** tracks current position in a document
- **Keyboard shortcuts**: press 1, 2, 3 for instant annotation
- **AI applies fixes** via MCP — agent reports implementations, you see inline before/after diffs
- **Fix preset toggle** in memo card: `Doc` (text_replace) / `Code` (artifact_text_replace)
- **One-click tool skeletons** in memo card: `Copy apply_memo`, `Copy respond_to_memo`, `Copy link_artifacts` (Code preset)
- **Labeled status actions**: Share Context, Follow MD Plan, Finalize, Approve all, Details (no icon-only guessing)
- **Status bar accessibility**: action buttons use larger touch targets (44x44) and sentence-case CTAs
- **Quality wording**: gate badge now reads `Quality check ...` for clearer meaning
- **Reopenable onboarding**: `Tips` button in status bar re-opens quick guidance anytime
- **In-app help**: `Help` opens docs directly from the sidebar
- **Delete safety**: annotation remove supports quick **Undo**
- **Finalize safety**: destructive `alertdialog` confirmation before stripping all annotations
- **Reduced motion support**: respects `prefers-reduced-motion`
- **Loading skeleton**: document loading uses structural skeleton instead of text-only spinner
- **7 status badges**: Open, Working, Review, Answered, Done, Failed, Won't Fix
- **Rollback**: agent can undo its last change if something went wrong
- **Batch operations**: multiple fixes applied in one transaction
- **Safe text replacement**: when the same text appears multiple times, agents must specify which one to change (prevents accidental wrong-line edits)
- **File safety**: blocks writes to .env, credentials, node_modules
- **Approve / Reject buttons** — always visible when review needed, one click to accept or dismiss
- **CodeLens in editor** — approve or reject directly in the markdown file, no sidebar needed
- **Activity Bar badge** — see pending review count at a glance
- **Status bar + toast notifications** — never miss when AI delivers work for review
- **Keyboard shortcuts** — Ctrl/Cmd+Shift+A approve, Ctrl/Cmd+Shift+X reject, Ctrl/Cmd+Shift+E export picker, Ctrl/Cmd+Shift+D open details, Ctrl/Cmd+Shift+H show tips
- **Gate override** — manually control gate status when auto-evaluation isn't enough
- **External file diffs inline** — see exactly what AI will change before applying
- **Gate transition notifications** — know when gates unblock or complete
- **Concurrent safety** — prevents data corruption when multiple AI operations run at the same time
- **Auto-refresh**: document updates in real-time when AI writes changes
- **Portable format**: annotations stored as HTML comments — works in any markdown renderer, survives git
- **Rich rendering**: Mermaid diagrams, callout blocks, syntax-highlighted code

## Quick Start (under 2 minutes)

1. **Install** from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)
2. **Annotate first** — select text in a markdown file, then press `1` (highlight), `2` (fix), `3` (question)
3. **Connect MCP (required for smooth workflow)** — after first annotation, click `Connect AI` in the sidebar and add config to your MCP client:

```json
{ "mcpServers": { "md-feedback": { "command": "npx", "args": ["-y", "md-feedback"] } } }
```

4. **Done** — with MCP connected, agents read annotations and implement them directly from markdown memos.

### Sidebar DX Flow (matches demo gif behavior)

1. Add `Fix`/`Question` annotations in sidebar.
2. For each `Fix`, pick preset in card footer:
   - `Doc`: document/body change path
   - `Code`: source-file change path
3. Use memo card action buttons:
   - `Copy apply_memo`
   - `Copy link_artifacts` (shown in `Code` preset)
   - `Copy respond_to_memo` (for `Question`)
4. Use status bar actions:
   - `Follow MD Plan` (copy implementation workflow prompt)
   - `Share Context` (optional share/interoperability)
   - `Finalize` (strip annotations after completion)
   - `Details` / `Tips` (reopen guidance and metadata view)
5. Agent runs MCP calls, then you approve/reject in the same sidebar.
6. If you remove an annotation by mistake, click **Undo** in the toast.

> **Node.js 18+ required** for MCP (`npx`). Claude path: `.claude/mcp.json`\
> Cursor path: `.cursor/mcp.json`

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

You can customize MD Feedback from VS Code Settings via `md-feedback.*`. Advanced timing and performance tuning options are available for large workspaces.

## MCP Server

MD Feedback includes an MCP server with 28 tools that let AI agents read your annotations without manual export. Agents can query memos, mark tasks done, apply fixes, check gate status, and generate handoffs — all through the Model Context Protocol.

**Setup:**

```bash
npx md-feedback
```

**Workspace override** — if your MCP client doesn't set `cwd` to the project folder (e.g. Antigravity), specify it explicitly:

```json
{ "command": "npx", "args": ["-y", "md-feedback", "--workspace=/path/to/project"] }
```

Windows example: `{ "command": "npx", "args": ["-y", "md-feedback", "--workspace=C:\\\\work\\\\my-project"] }`\
Or via environment variable: `MD_FEEDBACK_WORKSPACE=/path/to/project`

For full details, see [MCP Server documentation](https://github.com/yeominux/md-feedback/tree/main/apps/mcp-server#readme).

## Links

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)
- [npm (MCP Server)](https://www.npmjs.com/package/md-feedback)
- [Report Issues](https://github.com/yeominux/md-feedback/issues)
- [Contributing](https://github.com/yeominux/md-feedback/blob/main/CONTRIBUTING.md)
- [Sponsor](https://buymeacoffee.com/ymnseon8)

## License

[SUL-1.0](https://github.com/yeominux/md-feedback/blob/main/LICENSE) — Free for personal and non-commercial use.

---

## FAQ

**What is MD Feedback?**
MD Feedback is a VS Code extension and MCP server for reviewing markdown plans before AI agents implement them. Select text, press 1 (highlight), 2 (fix), or 3 (question) — annotations are stored as portable HTML comments in the markdown file itself. AI agents read annotations directly via MCP, or you can export to 11 AI tools.

**Does it work with Claude Code / Cursor / Copilot?**
Yes. MD Feedback can export shareable context files to Claude Code (`CLAUDE.md`), Cursor (`.cursor/rules/`), GitHub Copilot (`.github/copilot-instructions.md`), and 8 more tools. Implementation should run through MCP where agents read and apply markdown memos directly.

**What is MCP and why does it matter?**
MCP (Model Context Protocol) lets AI agents interact with external tools. MD Feedback's MCP server gives agents direct access to your annotations, so they can read feedback, mark tasks done, evaluate gates, and generate handoffs automatically. For example, when you mark a section as "Fix: use retry logic here," the agent reads that annotation via MCP, implements the fix, and marks it done — all without you switching tabs.

**Can multiple people review the same plan?**
Yes. Annotations are HTML comments embedded in the markdown file. They travel with the file through git — commits, branches, pull requests, and merges all preserve annotations intact.

**Is it free?**
Yes. MD Feedback is free for personal and non-commercial use under the [SUL-1.0](https://github.com/yeominux/md-feedback/blob/main/LICENSE) license.

**Who is this for?**
Developers using AI coding assistants who want to review plans before implementation, preserve context across sessions, and give agents structured feedback instead of unstructured chat messages.

More questions and advanced guidance: [MCP Server docs](https://github.com/yeominux/md-feedback/tree/main/apps/mcp-server#readme) and [GitHub Issues](https://github.com/yeominux/md-feedback/issues).

<!-- CHECKPOINT id="ckpt_mlvu3huf_x91v2r" time="2026-02-21T04:44:02.199Z" note="auto" fixes=0 questions=0 highlights=0 sections="" -->
