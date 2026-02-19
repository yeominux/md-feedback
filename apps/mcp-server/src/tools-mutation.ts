import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { appendProgress, writeSnapshot, writeTransaction } from './file-ops.js'
import { createCheckpoint } from '@md-feedback/shared'
import { splitDocument, mergeDocument, generateBodyHash, findMemoAnchorLine, computeLineHash } from '@md-feedback/shared'
import { generateId } from '@md-feedback/shared'
import { evaluateAllGates } from '@md-feedback/shared'
import type { DocumentParts, MemoStatus, MemoType, MemoColor, MemoV2, MemoImpl, MemoArtifact, ImplOperation, TextReplaceOp, FilePatchOp, FileCreateOp } from '@md-feedback/shared'
import { existsSync, unlinkSync } from 'node:fs'
import { withFileLock } from './file-mutex.js'
import { AnchorNotFoundError, MemoNotFoundError, OperationValidationError } from './errors.js'
import { assertMemoActionAllowed } from './policy.js'
import {
  advanceWorkflowPhase,
  approveCheckpoint,
  assertWorkflowToolAllowed,
  consumeHighRiskApproval,
  requestApprovalCheckpoint,
  setMemoSeverityOverride,
} from './workflow.js'
import type { MutationToolContext } from './tools-runtime.js'

export function registerMutationTools(server: McpServer, ctx: MutationToolContext): void {
  const { safeRead, safeWrite, wrapTool, ensureDefaultGate, updateCursorFromMemos, applyUnifiedDiff } = ctx

  // ─── create_checkpoint ───
  server.tool(
    'create_checkpoint',
    'Create a review checkpoint in an annotated markdown file. Records current annotation counts and reviewed sections.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      note: z.string().describe('Checkpoint note (e.g., "Phase 1 review done")'),
    },
    async ({ file, note }) => withFileLock(file, async () => wrapTool(async () => {
      assertWorkflowToolAllowed(file, 'create_checkpoint')
      const markdown = safeRead(file)
      const { checkpoint, updatedMarkdown } = createCheckpoint(markdown, note)
      safeWrite(file, updatedMarkdown)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ checkpoint }, null, 2),
        }],
      }
    })),
  )

  // ─── create_annotation ───
  server.tool(
    'create_annotation',
    'Create a new review annotation on a markdown file. Finds the anchor text in the document and attaches a review memo. Auto-creates a quality gate and updates cursor.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      anchorText: z.string().describe('The exact text in the document to annotate (must exist in the file)'),
      type: z.enum(['fix', 'question', 'highlight']).describe('fix = needs change, question = needs clarification, highlight = mark for reference'),
      text: z.string().describe('The review feedback or note to attach'),
      occurrence: z.number().int().min(1).optional().describe('Which occurrence of anchorText to annotate (1-indexed, default 1). Use when the same text appears multiple times.'),
    },
    async ({ file, anchorText, type, text, occurrence }) => withFileLock(file, async () => wrapTool(async () => {
      assertWorkflowToolAllowed(file, 'create_annotation')
      const markdown = safeRead(file)
      const parts = splitDocument(markdown)

      // Find anchor text in body — exact match preferred, longest match wins on tie
      const bodyLines = parts.body.split('\n')
      let anchorLine = -1

      if (occurrence) {
        // Explicit occurrence requested — find the Nth match
        let matchCount = 0
        for (let i = 0; i < bodyLines.length; i++) {
          if (bodyLines[i].includes(anchorText)) {
            matchCount++
            if (matchCount === occurrence) { anchorLine = i; break }
          }
        }
        if (anchorLine === -1) {
          const details = matchCount === 0
            ? { occurrenceRequested: occurrence, matchCount }
            : { occurrenceRequested: occurrence, matchCount }
          throw new AnchorNotFoundError(anchorText, details)
        }
      } else {
        // No occurrence specified — find best match
        const matches: number[] = []
        for (let i = 0; i < bodyLines.length; i++) {
          if (bodyLines[i].includes(anchorText)) matches.push(i)
        }

        if (matches.length === 0) {
          throw new AnchorNotFoundError(anchorText, { occurrenceRequested: null, matchCount: 0 })
        } else if (matches.length === 1) {
          anchorLine = matches[0]
        } else {
          // Multiple matches — prefer exact line match, then longest matching line
          const exactMatch = matches.find(i => bodyLines[i].trim() === anchorText.trim())
          if (exactMatch !== undefined) {
            anchorLine = exactMatch
          } else {
            // Pick the match where the line content is closest to the anchor text (shortest surplus)
            let bestIdx = matches[0]
            let bestSurplus = Infinity
            for (const idx of matches) {
              const surplus = bodyLines[idx].length - anchorText.length
              if (surplus < bestSurplus) {
                bestSurplus = surplus
                bestIdx = idx
              }
            }
            anchorLine = bestIdx
          }
        }
      }

      const lineHash = computeLineHash(bodyLines[anchorLine])
      const lineNum = anchorLine + 1
      const color: MemoColor = type === 'fix' ? 'red' : type === 'question' ? 'blue' : 'yellow'

      const memo: MemoV2 = {
        id: generateId('memo'),
        type: type as MemoType,
        status: 'open',
        owner: 'agent',
        source: 'mcp',
        color,
        text,
        anchorText,
        anchor: `L${lineNum}:L${lineNum}|${lineHash}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      parts.memos.push(memo)

      // Auto-create gate if none
      ensureDefaultGate(parts)
      parts.gates = evaluateAllGates(parts.gates, parts.memos)

      // Auto-update cursor
      updateCursorFromMemos(parts, memo.id, `Created ${type}: "${text.slice(0, 50)}"`)

      const updated = mergeDocument(parts)
      safeWrite(file, updated)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ memo, gateStatus: parts.gates[0]?.status, totalMemos: parts.memos.length }, null, 2),
        }],
      }
    })),
  )

  // ─── respond_to_memo (v0.4.0 NEW) ───
  server.tool(
    'respond_to_memo',
    'Add an AI response to a memo annotation. Inserts a REVIEW_RESPONSE block into the markdown file directly below the memo\'s anchor text. Automatically sets the memo status to "needs_review" for human approval.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      memoId: z.string().describe('The memo ID to respond to'),
      response: z.string().describe('The response text (markdown supported)'),
    },
    async ({ file, memoId, response }) => withFileLock(file, async () => wrapTool(async () => {
      assertWorkflowToolAllowed(file, 'respond_to_memo')
      const markdown = safeRead(file)
      const parts = splitDocument(markdown)

      const memo = parts.memos.find(m => m.id === memoId)
      if (!memo) {
        throw new MemoNotFoundError(memoId)
      }
      assertMemoActionAllowed('respond_to_memo', memoId, memo.type)

      // Check if a response already exists for this memo
      const existingResponse = parts.responses.find(r => r.to === memoId)
      if (existingResponse) {
        // Replace existing response content in the body
        const bodyLines = parts.body.split('\n')
        const newResponseLines = response.split('\n')
        const start = existingResponse.bodyStartIdx
        const end = existingResponse.bodyEndIdx
        const count = end >= start ? end - start + 1 : 0
        bodyLines.splice(start, count, ...newResponseLines)

        // Update bodyEndIdx
        existingResponse.bodyEndIdx = start + newResponseLines.length - 1
        parts.body = bodyLines.join('\n')
      } else {
        // Insert new response after the memo's anchor line
        const bodyLines = parts.body.split('\n')
        const anchorIdx = findMemoAnchorLine(bodyLines, memo)
        const insertAfter = anchorIdx >= 0 ? anchorIdx : bodyLines.length - 1

        // Skip past any existing memos on this anchor line (they'll be reinserted by mergeDocument)
        // Just insert the response content into the body
        const responseLines = response.split('\n')
        const insertIdx = insertAfter + 1
        bodyLines.splice(insertIdx, 0, ...responseLines)

        // Shift existing response indices that come after insertIdx
        for (const r of parts.responses) {
          if (r.bodyStartIdx >= insertIdx) {
            r.bodyStartIdx += responseLines.length
            r.bodyEndIdx += responseLines.length
          }
        }

        parts.body = bodyLines.join('\n')

        // Add response marker
        parts.responses.push({
          id: `resp_${memoId}`,
          to: memoId,
          bodyStartIdx: insertIdx,
          bodyEndIdx: insertIdx + responseLines.length - 1,
        })
      }

      // Auto-escalate to needs_review (requires human approval for terminal status)
      if (memo.status === 'open' || memo.status === 'in_progress') {
        memo.status = 'needs_review'
        memo.updatedAt = new Date().toISOString()
      }

      // Re-evaluate gates
      if (parts.gates.length > 0) {
        parts.gates = evaluateAllGates(parts.gates, parts.memos)
      }

      const updated = mergeDocument(parts)
      safeWrite(file, updated)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            memoId,
            status: memo.status,
            responseInserted: true,
            totalResponses: parts.responses.length,
          }, null, 2),
        }],
      }
    })),
  )

  // ─── update_memo_status (v0.4.0 NEW) ───
  server.tool(
    'update_memo_status',
    'Update the status of a memo annotation. Writes the change back to the markdown file. Returns the updated memo. Terminal statuses (answered, done, failed, wontfix) require human approval via VS Code.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      memoId: z.string().describe('The memo ID to update'),
      status: z.enum(['open', 'in_progress', 'needs_review']).describe('New status. Terminal statuses (answered, done, failed, wontfix) require human approval via VS Code.'),
      owner: z.enum(['human', 'agent', 'tool']).optional().describe('Optionally change the owner'),
    },
    async ({ file, memoId, status, owner }) => withFileLock(file, async () => wrapTool(async () => {
      assertWorkflowToolAllowed(file, 'update_memo_status')
      const markdown = safeRead(file)
      const parts = splitDocument(markdown)

      const memo = parts.memos.find(m => m.id === memoId)
      if (!memo) {
        throw new MemoNotFoundError(memoId)
      }

      memo.status = status as MemoStatus
      if (owner) memo.owner = owner as typeof memo.owner
      memo.updatedAt = new Date().toISOString()

      // Auto-create gate if none exists (CLI compatibility — mirrors VS Code T3)
      ensureDefaultGate(parts)

      // Re-evaluate gates after status change
      parts.gates = evaluateAllGates(parts.gates, parts.memos)

      // T2-L1: Auto-update cursor based on memo resolution progress
      updateCursorFromMemos(parts, memoId)

      const updated = mergeDocument(parts)
      safeWrite(file, updated)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ memo, gatesUpdated: parts.gates.length, cursor: parts.cursor }, null, 2),
        }],
      }
    })),
  )

  // ─── update_cursor (v0.4.0 NEW) ───
  server.tool(
    'update_cursor',
    'Update the plan cursor position in a markdown file. The cursor tracks "where we are" in a plan. Only one cursor per document.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      taskId: z.string().describe('Current task ID'),
      step: z.string().describe('Current step (e.g., "3/7" or "Phase 2")'),
      nextAction: z.string().describe('Description of the next action to take'),
    },
    async ({ file, taskId, step, nextAction }) => withFileLock(file, async () => wrapTool(async () => {
      assertWorkflowToolAllowed(file, 'update_cursor')
      const markdown = safeRead(file)
      const parts = splitDocument(markdown)

      // Validate taskId exists in memos
      if (parts.memos.length > 0 && !parts.memos.some(m => m.id === taskId)) {
        throw new OperationValidationError(
          `Task ID not found: "${taskId}". Valid IDs: ${parts.memos.map(m => m.id).join(', ')}`,
          { taskId, validTaskIds: parts.memos.map(m => m.id) },
        )
      }

      parts.cursor = {
        taskId,
        step,
        nextAction,
        lastSeenHash: generateBodyHash(parts.body),
        updatedAt: new Date().toISOString(),
      }

      const updated = mergeDocument(parts)
      safeWrite(file, updated)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ cursor: parts.cursor }, null, 2),
        }],
      }
    })),
  )

  // ─── apply_memo (v1.1 — apply an implementation to a memo) ───
  server.tool(
    'apply_memo',
    'Apply an implementation action to a memo. Supports text_replace (replaces all occurrences in current document), file_patch (applies unified diff patch — snapshot saved first), and file_create (create a new file). Creates a snapshot before modification, records the implementation, and updates memo status to needs_review.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      memoId: z.string().describe('The memo ID to apply implementation to'),
      action: z.enum(['text_replace', 'file_patch', 'file_create']).describe('Type of implementation action'),
      dryRun: z.boolean().optional().default(false).describe('If true, return preview without writing'),
      oldText: z.string().optional().describe('For text_replace: the text to find and replace'),
      newText: z.string().optional().describe('For text_replace: the replacement text'),
      targetFile: z.string().optional().describe('For file_patch/file_create: target file path'),
      patch: z.string().optional().describe('For file_patch: unified diff patch content'),
      content: z.string().optional().describe('For file_create: the file content to write'),
    },
    async ({ file, memoId, action, dryRun, oldText, newText, targetFile, patch, content: fileContent }) => withFileLock(file, async () => wrapTool(async () => {
      assertWorkflowToolAllowed(file, 'apply_memo')
      const markdown = safeRead(file)
      const parts = splitDocument(markdown)

      const memo = parts.memos.find(m => m.id === memoId)
      if (!memo) {
        throw new MemoNotFoundError(memoId)
      }
      assertMemoActionAllowed('apply_memo', memoId, memo.type)

      // Build operation record
      let operation: ImplOperation
      if (action === 'text_replace') {
        if (!oldText || newText === undefined) {
          throw new OperationValidationError('text_replace requires oldText and newText', { memoId, action })
        }
        operation = { type: 'text_replace', file: '', before: oldText, after: newText } as TextReplaceOp
      } else if (action === 'file_patch') {
        if (!targetFile || !patch) {
          throw new OperationValidationError('file_patch requires targetFile and patch', { memoId, action })
        }
        operation = { type: 'file_patch', file: targetFile, patch } as FilePatchOp
      } else {
        if (!targetFile || fileContent === undefined) {
          throw new OperationValidationError('file_create requires targetFile and content', { memoId, action })
        }
        operation = { type: 'file_create', file: targetFile, content: fileContent } as FileCreateOp
      }

      const impl: MemoImpl = {
        id: generateId('impl', { separator: '_' }),
        memoId,
        status: 'applied',
        operations: [operation],
        summary: `${action} for ${memoId}`,
        appliedAt: new Date().toISOString(),
      }

      if (dryRun) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ dryRun: true, impl, operation, memo: { id: memo.id, status: memo.status } }, null, 2),
          }],
        }
      }

      // Create snapshot before modification
      writeSnapshot(file, markdown)

      // Execute the operation
      if (action === 'text_replace') {
        if (!parts.body.includes(oldText!)) {
          throw new OperationValidationError('oldText not found in document body', { memoId, action })
        }
        parts.body = parts.body.split(oldText!).join(newText!)
      } else if (action === 'file_patch') {
        if (!existsSync(targetFile!)) {
          throw new OperationValidationError(
            `Target file not found for file_patch: ${targetFile}`,
            { memoId, action, targetFile },
          )
        }
        const originalTarget = safeRead(targetFile!)
        const patchedTarget = applyUnifiedDiff(originalTarget, patch!, targetFile!)
        writeSnapshot(targetFile!, originalTarget)
        safeWrite(targetFile!, patchedTarget)
      } else if (action === 'file_create') {
        safeWrite(targetFile!, fileContent!)
      }

      // Record impl and update memo
      parts.impls.push(impl)
      memo.status = 'needs_review'
      memo.updatedAt = new Date().toISOString()

      // Re-evaluate gates
      if (parts.gates.length > 0) {
        parts.gates = evaluateAllGates(parts.gates, parts.memos)
      }

      // Auto-update cursor
      updateCursorFromMemos(parts, memoId)

      const updated = mergeDocument(parts)
      safeWrite(file, updated)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ impl, memo: { id: memo.id, status: memo.status }, gatesUpdated: parts.gates.length }, null, 2),
        }],
      }
    })),
  )

  // ─── link_artifacts (v1.2 — link file artifacts to a memo) ───
  server.tool(
    'link_artifacts',
    'Link file artifacts (source files, configs, etc.) to a memo. Creates a MemoArtifact record in the document.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      memoId: z.string().describe('The memo ID to link artifacts to'),
      files: z.array(z.string()).describe('Array of relative file paths to link'),
    },
    async ({ file, memoId, files: artifactFiles }) => withFileLock(file, async () => wrapTool(async () => {
      assertWorkflowToolAllowed(file, 'link_artifacts')
      const markdown = safeRead(file)
      const parts = splitDocument(markdown)

      const memo = parts.memos.find(m => m.id === memoId)
      if (!memo) {
        throw new MemoNotFoundError(memoId)
      }

      const artifact: MemoArtifact = {
        id: generateId('art', { separator: '_' }),
        memoId,
        files: artifactFiles,
        linkedAt: new Date().toISOString(),
      }

      parts.artifacts.push(artifact)

      const updated = mergeDocument(parts)
      safeWrite(file, updated)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ artifact }, null, 2),
        }],
      }
    })),
  )

  // ─── update_memo_progress (v1.1 — update memo progress with status and message) ───
  server.tool(
    'update_memo_progress',
    'Update the progress of a memo with a status change and message. Writes progress to .md-feedback/progress.json and updates the memo status. Terminal statuses (done, failed) require human approval via VS Code.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      memoId: z.string().describe('The memo ID to update progress for'),
      status: z.enum(['in_progress', 'needs_review']).describe('New progress status. Terminal statuses (done, failed) require human approval via VS Code.'),
      message: z.string().describe('Progress message describing what was done or what failed'),
    },
    async ({ file, memoId, status, message }) => withFileLock(file, async () => wrapTool(async () => {
      assertWorkflowToolAllowed(file, 'update_memo_progress')
      const markdown = safeRead(file)
      const parts = splitDocument(markdown)

      const memo = parts.memos.find(m => m.id === memoId)
      if (!memo) {
        throw new MemoNotFoundError(memoId)
      }

      memo.status = status as MemoStatus
      memo.updatedAt = new Date().toISOString()

      const progressEntry = {
        memoId,
        status,
        message,
        timestamp: new Date().toISOString(),
      }
      await appendProgress(file, progressEntry)

      // Re-evaluate gates
      if (parts.gates.length > 0) {
        parts.gates = evaluateAllGates(parts.gates, parts.memos)
      }

      // Auto-update cursor
      updateCursorFromMemos(parts, memoId)

      const updated = mergeDocument(parts)
      safeWrite(file, updated)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ memo: { id: memo.id, status: memo.status }, progressEntry, gatesUpdated: parts.gates.length }, null, 2),
        }],
      }
    })),
  )

  // ─── rollback_memo (v1.1 — rollback the latest implementation for a memo) ───
  server.tool(
    'rollback_memo',
    'Rollback the latest implementation for a memo. Reverses text_replace operations (swaps before/after), marks the impl as reverted, and sets the memo status back to open.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      memoId: z.string().describe('The memo ID to rollback'),
    },
    async ({ file, memoId }) => withFileLock(file, async () => wrapTool(async () => {
      assertWorkflowToolAllowed(file, 'rollback_memo')
      consumeHighRiskApproval(file, 'rollback_memo', 'Rollback is high-risk because it can revert prior implementation state.')
      const markdown = safeRead(file)
      const parts = splitDocument(markdown)

      const memo = parts.memos.find(m => m.id === memoId)
      if (!memo) {
        throw new MemoNotFoundError(memoId)
      }

      // Find the latest impl for this memo
      const memoImpls = parts.impls.filter(imp => imp.memoId === memoId && imp.status === 'applied')
      if (memoImpls.length === 0) {
        throw new OperationValidationError(`No applied implementation found for memo: ${memoId}`, { memoId })
      }

      const latestImpl = memoImpls[memoImpls.length - 1]

      // Reverse operations
      for (const op of latestImpl.operations) {
        if (op.type === 'text_replace') {
          // Swap before/after to reverse
          if (parts.body.includes(op.after)) {
            parts.body = parts.body.split(op.after).join(op.before)
          }
        }
        // file_patch and file_create are not automatically reversible
      }

      // Mark impl as reverted
      latestImpl.status = 'reverted'

      // Set memo status back to open
      memo.status = 'open'
      memo.updatedAt = new Date().toISOString()

      // Re-evaluate gates
      if (parts.gates.length > 0) {
        parts.gates = evaluateAllGates(parts.gates, parts.memos)
      }

      // Auto-update cursor
      updateCursorFromMemos(parts, memoId)

      const updated = mergeDocument(parts)
      safeWrite(file, updated)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            rolledBack: latestImpl.id,
            memo: { id: memo.id, status: memo.status },
            gatesUpdated: parts.gates.length,
          }, null, 2),
        }],
      }
    })),
  )

  // ─── batch_apply (v1.1 — apply multiple operations in a single transaction) ───
  server.tool(
    'batch_apply',
    'Apply multiple implementation operations in a single transaction. Parses the document once, applies all operations sequentially, then writes once. Each operation follows the same format as apply_memo.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      operations: z.array(z.object({
        memoId: z.string().describe('The memo ID to apply implementation to'),
        action: z.enum(['text_replace', 'file_patch', 'file_create']).describe('Type of implementation action'),
        oldText: z.string().optional().describe('For text_replace: the text to find and replace'),
        newText: z.string().optional().describe('For text_replace: the replacement text'),
        targetFile: z.string().optional().describe('For file_patch/file_create: target file path'),
        patch: z.string().optional().describe('For file_patch: unified diff patch content'),
        content: z.string().optional().describe('For file_create: the file content to write'),
      })).describe('Array of operations to apply'),
    },
    async ({ file, operations }) => withFileLock(file, async () => wrapTool(async () => {
      assertWorkflowToolAllowed(file, 'batch_apply')
      consumeHighRiskApproval(file, 'batch_apply', 'Batch apply is high-risk because it can modify multiple files in one transaction.')
      const markdown = safeRead(file)
      const parts = splitDocument(markdown)

      const results: Array<{ memoId: string; implId: string; status: string }> = []
      const stagedFileWrites = new Map<string, string>()
      const originalFiles = new Map<string, string>()

      for (const op of operations) {
        const memo = parts.memos.find(m => m.id === op.memoId)
        if (!memo) {
          throw new MemoNotFoundError(op.memoId)
        }
        assertMemoActionAllowed('batch_apply', op.memoId, memo.type)

        let operation: ImplOperation
        if (op.action === 'text_replace') {
          if (!op.oldText || op.newText === undefined) {
            throw new OperationValidationError(
              `Operation failed (${op.memoId}): text_replace requires oldText and newText`,
              { memoId: op.memoId, action: op.action },
            )
          }
          operation = { type: 'text_replace', file: '', before: op.oldText, after: op.newText } as TextReplaceOp
          if (!parts.body.includes(op.oldText)) {
            throw new OperationValidationError(
              `Operation failed (${op.memoId}): oldText not found in body`,
              { memoId: op.memoId, action: op.action },
            )
          }
          parts.body = parts.body.split(op.oldText).join(op.newText)
          // Sync anchorText for affected memos to prevent stale references
          for (const m of parts.memos) {
            if (m.anchorText && m.anchorText.includes(op.oldText)) {
              m.anchorText = m.anchorText.split(op.oldText).join(op.newText)
            }
          }
        } else if (op.action === 'file_patch') {
          if (!op.targetFile || !op.patch) {
            throw new OperationValidationError(
              `Operation failed (${op.memoId}): file_patch requires targetFile and patch`,
              { memoId: op.memoId, action: op.action },
            )
          }
          operation = { type: 'file_patch', file: op.targetFile, patch: op.patch } as FilePatchOp
          const current = stagedFileWrites.has(op.targetFile)
            ? stagedFileWrites.get(op.targetFile)!
            : existsSync(op.targetFile)
              ? safeRead(op.targetFile)
              : null
          if (current === null) {
            throw new OperationValidationError(
              `Operation failed (${op.memoId}): target file not found for file_patch (${op.targetFile})`,
              { memoId: op.memoId, action: op.action, targetFile: op.targetFile },
            )
          }
          const patched = applyUnifiedDiff(current, op.patch, op.targetFile)
          stagedFileWrites.set(op.targetFile, patched)
        } else {
          if (!op.targetFile || op.content === undefined) {
            throw new OperationValidationError(
              `Operation failed (${op.memoId}): file_create requires targetFile and content`,
              { memoId: op.memoId, action: op.action },
            )
          }
          if (existsSync(op.targetFile) && !stagedFileWrites.has(op.targetFile)) {
            throw new OperationValidationError(
              `Operation failed (${op.memoId}): file_create target already exists (${op.targetFile})`,
              { memoId: op.memoId, action: op.action, targetFile: op.targetFile },
            )
          }
          operation = { type: 'file_create', file: op.targetFile, content: op.content } as FileCreateOp
          stagedFileWrites.set(op.targetFile, op.content)
        }

        const impl: MemoImpl = {
          id: generateId('impl', { separator: '_' }),
          memoId: op.memoId,
          status: 'applied',
          operations: [operation],
          summary: `${op.action} for ${op.memoId}`,
          appliedAt: new Date().toISOString(),
        }

        parts.impls.push(impl)
        memo.status = 'needs_review'
        memo.updatedAt = new Date().toISOString()
        results.push({ memoId: op.memoId, implId: impl.id, status: 'applied' })
      }

      // Re-evaluate gates
      if (parts.gates.length > 0) {
        parts.gates = evaluateAllGates(parts.gates, parts.memos)
      }

      // Auto-update cursor
      updateCursorFromMemos(parts, operations[0]?.memoId || '')

      const updated = mergeDocument(parts)

      originalFiles.set(file, markdown)
      for (const targetFile of stagedFileWrites.keys()) {
        if (existsSync(targetFile)) {
          originalFiles.set(targetFile, safeRead(targetFile))
        }
      }

      // Snapshots before commit
      writeSnapshot(file, markdown)
      for (const [targetFile, original] of originalFiles.entries()) {
        if (targetFile !== file) writeSnapshot(targetFile, original)
      }

      const writtenFiles: string[] = []
      try {
        for (const [targetFile, content] of stagedFileWrites.entries()) {
          safeWrite(targetFile, content)
          writtenFiles.push(targetFile)
        }
        safeWrite(file, updated)
        writtenFiles.push(file)
      } catch (commitErr) {
        for (let idx = writtenFiles.length - 1; idx >= 0; idx--) {
          const writtenFile = writtenFiles[idx]
          const original = originalFiles.get(writtenFile)
          if (original !== undefined) {
            try { safeWrite(writtenFile, original) } catch { /* best effort rollback */ }
          } else {
            try { unlinkSync(writtenFile) } catch { /* best effort rollback */ }
          }
        }
        throw commitErr
      }

      // Write transaction record
      writeTransaction(file, { type: 'batch_apply', results, timestamp: new Date().toISOString() })

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ results, gatesUpdated: parts.gates.length, cursor: parts.cursor }, null, 2),
        }],
      }
    })),
  )

  // ─── advance_workflow_phase (v1.3 — explicit workflow phase transition) ───
  server.tool(
    'advance_workflow_phase',
    'Advance workflow phase in strict sequence: scope -> root_cause -> implementation -> verification.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      toPhase: z.enum(['root_cause', 'implementation', 'verification']).describe('Next phase to move to'),
      note: z.string().optional().describe('Optional transition note'),
    },
    async ({ file, toPhase, note }) => withFileLock(file, async () => wrapTool(async () => {
      const workflow = advanceWorkflowPhase(file, toPhase, 'advance_workflow_phase', note)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ workflow }, null, 2),
        }],
      }
    })),
  )

  // ─── set_memo_severity (v1.3 — set blocking/non-blocking severity override) ───
  server.tool(
    'set_memo_severity',
    'Set severity override for a memo. Defaults remain: fix=blocking, question/highlight=non_blocking.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      memoId: z.string().describe('Memo ID to classify'),
      severity: z.enum(['blocking', 'non_blocking']).describe('Severity override'),
    },
    async ({ file, memoId, severity }) => withFileLock(file, async () => wrapTool(async () => {
      assertWorkflowToolAllowed(file, 'set_memo_severity')
      const markdown = safeRead(file)
      const parts = splitDocument(markdown)
      const memo = parts.memos.find(m => m.id === memoId)
      if (!memo) {
        throw new MemoNotFoundError(memoId)
      }

      const severityState = setMemoSeverityOverride(file, memoId, severity)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            memoId,
            severity,
            severityState,
          }, null, 2),
        }],
      }
    })),
  )

  // ─── request_approval_checkpoint (v1.3 — create explicit HITL approval checkpoint) ───
  server.tool(
    'request_approval_checkpoint',
    'Create an approval checkpoint for a high-risk action before execution.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      tool: z.string().describe('High-risk tool name (e.g., batch_apply, rollback_memo)'),
      reason: z.string().describe('Reason for approval request'),
    },
    async ({ file, tool, reason }) => withFileLock(file, async () => wrapTool(async () => {
      assertWorkflowToolAllowed(file, 'request_approval_checkpoint')
      const workflow = requestApprovalCheckpoint(file, tool, reason)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ workflow }, null, 2),
        }],
      }
    })),
  )

  // ─── approve_checkpoint (v1.3 — approve pending HITL checkpoint) ───
  server.tool(
    'approve_checkpoint',
    'Approve a pending high-risk checkpoint. Grants one execution for the approved tool.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      tool: z.string().describe('Tool name being approved'),
      approvedBy: z.string().describe('Approver identity'),
      reason: z.string().describe('Approval rationale'),
    },
    async ({ file, tool, approvedBy, reason }) => withFileLock(file, async () => wrapTool(async () => {
      assertWorkflowToolAllowed(file, 'approve_checkpoint')
      const workflow = approveCheckpoint(file, tool, approvedBy, reason)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ workflow }, null, 2),
        }],
      }
    })),
  )
}
