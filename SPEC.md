# md-feedback Protocol Specification

**Version:** 1.0.0
**Status:** Stable
**Repository:** https://github.com/yeominux/md-feedback

This document defines the md-feedback annotation standard — an open protocol for structured human review of AI-generated implementation plans. Any tool that reads or writes md-feedback annotations must conform to this specification.

---

## 1. Annotation Format

Annotations are stored as **HTML comments embedded in markdown files**. This makes them:
- Invisible in rendered markdown (no visual noise)
- Portable across git commits, branches, and merges
- Readable by any text parser without custom tooling

### Syntax

```
<!-- md-feedback:[type] [id] [metadata] -->
[optional context line(s)]
<!-- /md-feedback -->
```

In practice, annotations appear inline with the plan text they refer to:

```markdown
## Step 3: Migrate the database

<!-- md-feedback:fix id=abc123 status=open severity=high -->
This step needs a rollback procedure before we can proceed.
<!-- /md-feedback -->
```

---

## 2. Annotation Types

Three annotation types are defined. Implementations MUST support all three.

| Type | Keyword | Blocking? | Meaning |
|------|---------|-----------|---------|
| Highlight | `highlight` | No | Reading mark — human flagged for attention |
| Fix | `fix` | **Yes** | Must be resolved before AI implementation begins |
| Question | `question` | No | Needs clarification; AI should ask before proceeding |

**Quality gate rule:** An AI agent MUST NOT begin implementing a plan when any `fix` annotation with `status=open` exists in the target file. `highlight` and `question` annotations are non-blocking.

### Annotation Fields

| Field | Required | Values | Description |
|-------|----------|--------|-------------|
| `type` | Yes | `highlight`, `fix`, `question` | Annotation type |
| `id` | Yes | alphanumeric string | Unique identifier within the document |
| `status` | Yes | `open`, `resolved`, `acknowledged` | Current state |
| `severity` | No | `high`, `medium`, `low` | For `fix` type only |
| `assignee` | No | string | Who is responsible for resolving |

---

## 3. Workflow Phases

md-feedback defines three workflow phases for a plan document:

| Phase | Description |
|-------|-------------|
| `review` | Human is annotating the plan |
| `implementation` | AI is implementing; fix gates must pass |
| `complete` | All annotations resolved; implementation done |

Transitions: `review` → `implementation` (when all fix annotations are resolved) → `complete`.

---

## 4. MCP Tool Interface

The md-feedback MCP server exposes 27 tools organized into query tools and mutation tools. All tools communicate via the Model Context Protocol (JSON-RPC 2.0).

**Transport:** stdio (default) or HTTP
**Node.js requirement:** 18+
**Launch command:** `npx md-feedback` or `md-feedback` (after global install)

### 4.1 Query Tools — Document

| Tool | Description |
|------|-------------|
| `list_documents` | Lists all markdown documents with annotations in the workspace |
| `list_annotations` | Lists all annotations in a specific document; supports filtering by type, status, severity |
| `get_document_structure` | Returns the heading structure and section boundaries of a document |
| `get_review_status` | Returns gate pass/fail status and count of open/resolved annotations |
| `get_workflow_status` | Returns the current workflow phase for a document |
| `get_policy_status` | Returns the quality gate policy configuration |
| `get_severity_status` | Returns annotation counts grouped by severity level |
| `get_checkpoints` | Returns all checkpoints recorded for a document |
| `generate_handoff` | Generates a session handoff document for AI context preservation across sessions |
| `pickup_handoff` | Restores context from a previously generated handoff document |
| `evaluate_gates` | Evaluates all quality gates and returns pass/fail with blocking annotation details |

### 4.2 Query Tools — Export

| Tool | Description |
|------|-------------|
| `export_review` | Exports the annotated plan to a format suitable for 11 AI platforms (Claude Code, Cursor, Copilot, Cline, etc.) |
| `get_memo_changes` | Returns before/after diffs for a specific annotation (shows proposed change) |

### 4.3 Mutation Tools

| Tool | Description |
|------|-------------|
| `create_annotation` | Creates a new annotation at a specified location in a document |
| `respond_to_memo` | Adds a response or clarification to an existing annotation |
| `update_memo_status` | Updates the status of an annotation (`open` → `resolved` / `acknowledged`) |
| `update_memo_progress` | Updates the implementation progress for an annotation |
| `apply_memo` | Applies a fix to the document (rewrites the annotated section with the proposed change) |
| `batch_apply` | Applies multiple fixes in a single atomic operation |
| `rollback_memo` | Reverts an applied fix back to the pre-annotation state |
| `update_cursor` | Updates the reading cursor position within a document |
| `link_artifacts` | Links external artifacts (files, PRs, tickets) to an annotation |
| `set_memo_severity` | Sets or updates the severity level of an annotation |
| `create_checkpoint` | Records a progress checkpoint for a document |
| `request_approval_checkpoint` | Creates a checkpoint that requires explicit human approval before proceeding |
| `approve_checkpoint` | Approves a pending approval checkpoint |
| `advance_workflow_phase` | Transitions a document from one workflow phase to the next |

---

## 5. Quality Gate Protocol

A **quality gate** is a pass/fail evaluation that runs before an AI agent begins implementation.

**Default gate (built-in):**
- PASS: zero `fix` annotations with `status=open` in the target document
- FAIL: one or more `fix` annotations with `status=open`

**Evaluating gates:**
Use the `evaluate_gates` tool. It returns:
```json
{
  "passed": false,
  "blocking_annotations": [
    { "id": "abc123", "type": "fix", "status": "open", "severity": "high" }
  ],
  "total_open_fixes": 1
}
```

**Recommended agent behavior:**
1. Before implementing a plan, call `evaluate_gates`
2. If `passed: false`, surface the blocking annotations to the human and request resolution
3. Only proceed when `passed: true`

---

## 6. Versioning

This specification uses semantic versioning. Breaking changes to the annotation format or MCP tool interface require a major version bump.

**Current version:** 1.0.0
**Changelog:** See [CHANGELOG.md](CHANGELOG.md)
**Proposing changes:** Open an issue at https://github.com/yeominux/md-feedback/issues

---

## 7. License

md-feedback is available under the SUL-1.0 license (personal and non-commercial use).
See [LICENSE](LICENSE) for details.
