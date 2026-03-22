# Plan Review Workflow

This project uses **md-feedback** for structured human review of implementation plans.

## Before implementing any plan

For any plan file (*.md, *.plan.md) that describes implementation steps:

1. **Check for md-feedback annotations:**
   ```
   evaluate_gates({ document: "<path-to-plan-file>" })
   ```

2. **If gates fail** (open Fix annotations exist):
   - List them: `list_annotations({ document: "<file>", type: "fix", status: "open" })`
   - Surface to the human. Do NOT begin implementation until `passed: true`

3. **If gates pass:**
   - Check questions: `list_annotations({ document: "<file>", type: "question" })`
   - Clarify, then implement

4. **During implementation:**
   - `update_memo_status({ id: "<id>", status: "resolved" })` as you complete items
   - `create_checkpoint(...)` at milestones

5. **After implementation:**
   - `evaluate_gates(...)` — confirm all resolved
   - `generate_handoff(...)` — preserve context for next session

## Annotation types
- `highlight` — attention flag, non-blocking
- `fix` — **BLOCKING**: do not implement until resolved
- `question` — clarify before proceeding

## MCP setup
```bash
npx md-feedback
```
Docs: https://github.com/yeominux/md-feedback
