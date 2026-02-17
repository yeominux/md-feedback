import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { readMarkdownFile, writeMarkdownFile, writeSnapshot, readProgress, appendProgress, writeTransaction } from './file-ops.js'
import { createCheckpoint, extractCheckpoints, getAnnotationCounts, getSectionsWithAnnotations, getAllSections } from '@md-feedback/shared'
import { buildHandoffDocument, formatHandoffMarkdown, parseHandoffFile } from '@md-feedback/shared'
import { extractMemos } from '@md-feedback/shared'
import { splitDocument, mergeDocument, serializeMemoV2, serializeCursor, generateBodyHash } from '@md-feedback/shared'
import { evaluateAllGates } from '@md-feedback/shared'
import { generateContext, type TargetFormat } from '@md-feedback/shared'
import type { MemoStatus, MemoType, MemoColor, MemoV2, ReviewDocument, ReviewHighlight, ReviewMemo, MemoImpl, MemoArtifact, ImplOperation, TextReplaceOp, FilePatchOp, FileCreateOp } from '@md-feedback/shared'
import { isResolved } from '@md-feedback/shared'
import { createFileSafety, validateFilePath } from './file-safety.js'
import { computeMetrics } from './metrics.js'

/** djb2 hash — must match shared/document-writer.ts hashLine */
function computeLineHash(line: string): string {
  let hash = 5381
  for (let i = 0; i < line.length; i++) {
    hash = ((hash << 5) + hash + line.charCodeAt(i)) >>> 0
  }
  return hash.toString(16).padStart(8, '0').slice(0, 8)
}

export function registerTools(server: McpServer): void {

  // ─── create_checkpoint ───
  server.tool(
    'create_checkpoint',
    'Create a review checkpoint in an annotated markdown file. Records current annotation counts and reviewed sections.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      note: z.string().describe('Checkpoint note (e.g., "Phase 1 review done")'),
    },
    async ({ file, note }) => {
      try {
        const markdown = readMarkdownFile(file)
        const { checkpoint, updatedMarkdown } = createCheckpoint(markdown, note)
        writeMarkdownFile(file, updatedMarkdown)
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ checkpoint }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
  )

  // ─── get_checkpoints ───
  server.tool(
    'get_checkpoints',
    'List all checkpoints in an annotated markdown file.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
    },
    async ({ file }) => {
      try {
        const markdown = readMarkdownFile(file)
        const checkpoints = extractCheckpoints(markdown)
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ checkpoints }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
  )

  // ─── generate_handoff ───
  server.tool(
    'generate_handoff',
    'Generate a structured handoff document from an annotated markdown file. Anti-compression format: explicit fields, numbers, lists only.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      target: z.enum(['standalone', 'claude-md', 'cursor-rules']).optional()
        .describe('Output format target (default: standalone)'),
    },
    async ({ file, target }) => {
      try {
        const markdown = readMarkdownFile(file)
        const doc = buildHandoffDocument(markdown, file)
        const handoff = formatHandoffMarkdown(doc, target || 'standalone')
        return {
          content: [{
            type: 'text' as const,
            text: handoff,
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
  )

  // ─── get_review_status ───
  server.tool(
    'get_review_status',
    'Get current review session status: annotation counts, checkpoints, and reviewed sections. Summary-only — returns counts and metadata, not individual memos. Use list_annotations for memo details or get_document_structure for the full parse.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
    },
    async ({ file }) => {
      try {
        const markdown = readMarkdownFile(file)
        const counts = getAnnotationCounts(markdown)
        const checkpoints = extractCheckpoints(markdown)
        const sections = getSectionsWithAnnotations(markdown)
        const status = {
          file,
          annotations: counts,
          checkpointCount: checkpoints.length,
          lastCheckpoint: checkpoints.length > 0 ? checkpoints[checkpoints.length - 1].timestamp : null,
          sectionsReviewed: sections,
        }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(status, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
  )

  // ─── pickup_handoff ───
  server.tool(
    'pickup_handoff',
    'Parse an existing handoff document to resume a review session. Returns structured data for session continuity.',
    {
      file: z.string().describe('Path to the handoff markdown file'),
    },
    async ({ file }) => {
      try {
        const markdown = readMarkdownFile(file)
        const doc = parseHandoffFile(markdown)
        if (!doc) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: 'Not a valid handoff document' }),
            }],
            isError: true,
          }
        }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(doc, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
  )

  // ─── list_annotations ───
  server.tool(
    'list_annotations',
    'List all annotations (USER_MEMO comments) in a markdown file. Returns structured array with id, type, status, owner, text, and color. Lightweight — returns only memo data, no document body or sections. Use get_document_structure for the full parse.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
    },
    async ({ file }) => {
      try {
        const markdown = readMarkdownFile(file)
        const parts = splitDocument(markdown)
        const annotations = parts.memos.map(m => ({
          id: m.id,
          type: m.type,
          status: m.status,
          owner: m.owner,
          source: m.source,
          color: m.color,
          text: m.text,
          anchorText: m.anchorText,
          anchor: m.anchor,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        }))
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ annotations, total: annotations.length }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
  )

  // ─── get_document_structure (v0.4.0 — full ReviewDocument) ───
  server.tool(
    'get_document_structure',
    'Parse an annotated markdown file and return the full v0.4.0 ReviewDocument: { bodyMd, memos[] (with status/owner), checkpoints[], gates[], cursor, sections, summary }. Most comprehensive tool — use this when you need the complete document state. Use list_annotations for just memos, or get_review_status for just counts.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
    },
    async ({ file }) => {
      try {
        const markdown = readMarkdownFile(file)
        const parts = splitDocument(markdown)
        const allSections = getAllSections(markdown)
        const reviewedSections = getSectionsWithAnnotations(markdown)

        // Evaluate gates with current memo states
        const gates = evaluateAllGates(parts.gates, parts.memos)

        const open = parts.memos.filter(m => m.status === 'open').length
        const inProgress = parts.memos.filter(m => m.status === 'in_progress').length
        const answered = parts.memos.filter(m => m.status === 'answered').length
        const done = parts.memos.filter(m => m.status === 'done').length
        const failed = parts.memos.filter(m => m.status === 'failed').length
        const wontfix = parts.memos.filter(m => m.status === 'wontfix').length
        const blocked = gates.filter(g => g.status === 'blocked').length

        const structure: ReviewDocument = {
          version: '0.4.0',
          file,
          bodyMd: parts.body,
          memos: parts.memos,
          checkpoints: parts.checkpoints,
          gates,
          cursor: parts.cursor,
          sections: {
            all: allSections,
            reviewed: reviewedSections,
            uncovered: allSections.filter(s => !reviewedSections.includes(s)),
          },
          impls: parts.impls,
          artifacts: parts.artifacts,
          dependencies: parts.dependencies,
          summary: {
            total: parts.memos.length,
            open,
            inProgress,
            answered,
            done,
            failed,
            wontfix,
            blocked,
            fixes: parts.memos.filter(m => m.type === 'fix').length,
            questions: parts.memos.filter(m => m.type === 'question').length,
            highlights: parts.memos.filter(m => m.type === 'highlight').length,
          },
        }

        // Compute metrics
        const metrics = computeMetrics(
          parts.memos, parts.impls, gates,
          parts.checkpoints, parts.artifacts, parts.dependencies,
        )

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ ...structure, metrics }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
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
    async ({ file, anchorText, type, text, occurrence }) => {
      try {
        const markdown = readMarkdownFile(file)
        const parts = splitDocument(markdown)

        // B-7: Find the Nth occurrence of anchor in body
        const targetOccurrence = occurrence ?? 1
        const bodyLines = parts.body.split('\n')
        let anchorLine = -1
        let matchCount = 0
        for (let i = 0; i < bodyLines.length; i++) {
          if (bodyLines[i].includes(anchorText)) {
            matchCount++
            if (matchCount === targetOccurrence) { anchorLine = i; break }
          }
        }
        if (anchorLine === -1) {
          const errMsg = matchCount === 0
            ? `Anchor text not found: "${anchorText}"`
            : `Anchor text "${anchorText}" has ${matchCount} occurrence(s), but occurrence=${targetOccurrence} requested`
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }],
            isError: true,
          }
        }

        const lineHash = computeLineHash(bodyLines[anchorLine])
        const lineNum = anchorLine + 1
        const color: MemoColor = type === 'fix' ? 'red' : type === 'question' ? 'blue' : 'yellow'

        const memo: MemoV2 = {
          id: `memo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
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
        if (parts.gates.length === 0) {
          parts.gates.push({
            id: `gate-${Date.now().toString(36)}`,
            type: 'merge',
            status: 'blocked',
            blockedBy: [],
            canProceedIf: '',
            doneDefinition: 'All review annotations resolved',
          })
        }
        parts.gates = evaluateAllGates(parts.gates, parts.memos)

        // Auto-update cursor
        const resolvedCount = parts.memos.filter(m => m.status !== 'open').length
        parts.cursor = {
          taskId: memo.id,
          step: `${resolvedCount}/${parts.memos.length} resolved`,
          nextAction: `Created ${type}: "${text.slice(0, 50)}"`,
          lastSeenHash: generateBodyHash(parts.body),
          updatedAt: new Date().toISOString(),
        }

        const updated = mergeDocument(parts)
        writeMarkdownFile(file, updated)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ memo, gateStatus: parts.gates[0]?.status, totalMemos: parts.memos.length }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
  )

  // ─── respond_to_memo (v0.4.0 NEW) ───
  server.tool(
    'respond_to_memo',
    'Add an AI response to a memo annotation. Inserts a REVIEW_RESPONSE block into the markdown file directly below the memo\'s anchor text. Automatically sets the memo status to "answered".',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      memoId: z.string().describe('The memo ID to respond to'),
      response: z.string().describe('The response text (markdown supported)'),
    },
    async ({ file, memoId, response }) => {
      try {
        const markdown = readMarkdownFile(file)
        const parts = splitDocument(markdown)

        const memo = parts.memos.find(m => m.id === memoId)
        if (!memo) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: `Memo not found: ${memoId}` }),
            }],
            isError: true,
          }
        }

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
          let insertAfter = -1

          // Find the memo's anchor line
          if (memo.anchor) {
            const anchorMatch = memo.anchor.match(/^L(\d+)(?::L\d+)?\|(.+)$/)
            if (anchorMatch) {
              const lineNum = parseInt(anchorMatch[1], 10) - 1
              const expectedHash = computeLineHash(bodyLines[lineNum] || '')
              if (lineNum >= 0 && lineNum < bodyLines.length && expectedHash === anchorMatch[2]) {
                insertAfter = lineNum
              } else {
                // Search nearby
                for (let delta = 1; delta <= 10; delta++) {
                  for (const d of [lineNum - delta, lineNum + delta]) {
                    if (d >= 0 && d < bodyLines.length && computeLineHash(bodyLines[d]) === anchorMatch[2]) {
                      insertAfter = d
                      break
                    }
                  }
                  if (insertAfter >= 0) break
                }
              }
            }
          }
          // Fallback: search by anchorText
          if (insertAfter === -1 && memo.anchorText) {
            for (let i = 0; i < bodyLines.length; i++) {
              if (bodyLines[i].includes(memo.anchorText)) {
                insertAfter = i
                break
              }
            }
          }
          // Last resort: append to end
          if (insertAfter === -1) {
            insertAfter = bodyLines.length - 1
          }

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

        // Auto-answer the memo
        if (memo.status === 'open') {
          memo.status = 'answered'
          memo.updatedAt = new Date().toISOString()
        }

        // Re-evaluate gates
        if (parts.gates.length > 0) {
          parts.gates = evaluateAllGates(parts.gates, parts.memos)
        }

        const updated = mergeDocument(parts)
        writeMarkdownFile(file, updated)

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
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
  )

  // ─── update_memo_status (v0.4.0 NEW) ───
  server.tool(
    'update_memo_status',
    'Update the status of a memo annotation. Writes the change back to the markdown file. Returns the updated memo.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      memoId: z.string().describe('The memo ID to update'),
      status: z.enum(['open', 'in_progress', 'answered', 'done', 'failed', 'wontfix']).describe('New status'),
      owner: z.enum(['human', 'agent', 'tool']).optional().describe('Optionally change the owner'),
    },
    async ({ file, memoId, status, owner }) => {
      try {
        const markdown = readMarkdownFile(file)
        const parts = splitDocument(markdown)

        const memo = parts.memos.find(m => m.id === memoId)
        if (!memo) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: `Memo not found: ${memoId}` }),
            }],
            isError: true,
          }
        }

        memo.status = status as MemoStatus
        if (owner) memo.owner = owner as typeof memo.owner
        memo.updatedAt = new Date().toISOString()

        // Auto-create gate if none exists (CLI compatibility — mirrors VS Code T3)
        if (parts.gates.length === 0 && parts.memos.length > 0) {
          parts.gates.push({
            id: `gate-${Date.now().toString(36)}`,
            type: 'merge',
            status: 'blocked',
            blockedBy: [],
            canProceedIf: '',
            doneDefinition: 'All review annotations resolved',
          })
        }

        // Re-evaluate gates after status change
        parts.gates = evaluateAllGates(parts.gates, parts.memos)

        // T2-L1: Auto-update cursor based on memo resolution progress
        const resolvedCount = parts.memos.filter(m => m.status !== 'open').length
        const totalCount = parts.memos.length
        const openMemos = parts.memos.filter(m => m.status === 'open')
        parts.cursor = {
          taskId: memoId,
          step: `${resolvedCount}/${totalCount} resolved`,
          nextAction: openMemos.length === 0
            ? 'All annotations resolved — review complete'
            : `Resolve: ${openMemos.map(m => m.id).slice(0, 3).join(', ')}${openMemos.length > 3 ? '...' : ''}`,
          lastSeenHash: generateBodyHash(parts.body),
          updatedAt: new Date().toISOString(),
        }

        const updated = mergeDocument(parts)
        writeMarkdownFile(file, updated)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ memo, gatesUpdated: parts.gates.length, cursor: parts.cursor }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
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
    async ({ file, taskId, step, nextAction }) => {
      try {
        const markdown = readMarkdownFile(file)
        const parts = splitDocument(markdown)

        // Validate taskId exists in memos
        if (parts.memos.length > 0 && !parts.memos.some(m => m.id === taskId)) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: `Task ID not found: "${taskId}". Valid IDs: ${parts.memos.map(m => m.id).join(', ')}`,
              }),
            }],
            isError: true,
          }
        }

        parts.cursor = {
          taskId,
          step,
          nextAction,
          lastSeenHash: generateBodyHash(parts.body),
          updatedAt: new Date().toISOString(),
        }

        const updated = mergeDocument(parts)
        writeMarkdownFile(file, updated)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ cursor: parts.cursor }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
  )

  // ─── evaluate_gates (v0.4.0 NEW) ───
  server.tool(
    'evaluate_gates',
    'Evaluate all gates in a markdown file against current memo statuses. Returns updated gate statuses without modifying the file.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
    },
    async ({ file }) => {
      try {
        const markdown = readMarkdownFile(file)
        const parts = splitDocument(markdown)
        const gates = evaluateAllGates(parts.gates, parts.memos)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              gates,
              summary: {
                total: gates.length,
                blocked: gates.filter(g => g.status === 'blocked').length,
                proceed: gates.filter(g => g.status === 'proceed').length,
                done: gates.filter(g => g.status === 'done').length,
              },
            }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
  )

  // ─── export_review ───
  server.tool(
    'export_review',
    'Export review feedback in a format optimized for a specific AI coding tool. Targets: claude-code, cursor, codex, copilot, cline, windsurf, roo-code, gemini, generic, handoff. Returns formatted markdown ready to save to the appropriate file.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      target: z.enum(['claude-code', 'cursor', 'codex', 'copilot', 'cline', 'windsurf', 'roo-code', 'gemini', 'antigravity', 'generic', 'handoff']).describe('Target AI tool format'),
    },
    async ({ file, target }) => {
      try {
        const markdown = readMarkdownFile(file)

        if (target === 'handoff') {
          const doc = buildHandoffDocument(markdown, file)
          const handoff = formatHandoffMarkdown(doc, 'standalone')
          return { content: [{ type: 'text' as const, text: handoff }] }
        }

        // Extract memos and convert to ReviewMemo[] + ReviewHighlight[]
        const { memos } = extractMemos(markdown)
        const allSections = getAllSections(markdown)
        const docTitle = allSections[0] || 'Plan Review'

        // Convert extracted memos to the format expected by generateContext
        const MEMO_COLOR_TO_HEX: Record<string, string> = { red: '#fca5a5', blue: '#93c5fd', yellow: '#fef08a' }
        const highlights: ReviewHighlight[] = memos.map(m => ({
          text: m.anchorText || '',
          color: MEMO_COLOR_TO_HEX[m.color] || '#fef08a',
          section: '',
          context: '',
        }))
        const docMemos: ReviewMemo[] = memos.map(m => ({
          id: m.id,
          text: m.text,
          color: m.color,
          section: '',
          context: m.anchorText || '',
        }))

        const content = generateContext(docTitle, file, allSections, highlights, docMemos, target as TargetFormat)
        return { content: [{ type: 'text' as const, text: content }] }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
  )

  // ─── apply_memo (v1.1 — apply an implementation to a memo) ───
  server.tool(
    'apply_memo',
    'Apply an implementation action to a memo. Supports text_replace (on current document), file_patch (apply patch to target file), and file_create (create a new file). Creates a snapshot before modification, records the implementation, and updates memo status to done.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      memoId: z.string().describe('The memo ID to apply implementation to'),
      action: z.enum(['text_replace', 'file_patch', 'file_create']).describe('Type of implementation action'),
      dryRun: z.boolean().optional().default(false).describe('If true, return preview without writing'),
      oldText: z.string().optional().describe('For text_replace: the text to find and replace'),
      newText: z.string().optional().describe('For text_replace: the replacement text'),
      targetFile: z.string().optional().describe('For file_patch/file_create: target file path'),
      patch: z.string().optional().describe('For file_patch: the patch content'),
      content: z.string().optional().describe('For file_create: the file content to write'),
    },
    async ({ file, memoId, action, dryRun, oldText, newText, targetFile, patch, content: fileContent }) => {
      try {
        const markdown = readMarkdownFile(file)
        const parts = splitDocument(markdown)

        const memo = parts.memos.find(m => m.id === memoId)
        if (!memo) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Memo not found: ${memoId}` }) }],
            isError: true,
          }
        }

        // Build operation record
        let operation: ImplOperation
        if (action === 'text_replace') {
          if (!oldText || newText === undefined) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'text_replace requires oldText and newText' }) }],
              isError: true,
            }
          }
          operation = { type: 'text_replace', file: '', before: oldText, after: newText } as TextReplaceOp
        } else if (action === 'file_patch') {
          if (!targetFile || !patch) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'file_patch requires targetFile and patch' }) }],
              isError: true,
            }
          }
          operation = { type: 'file_patch', file: targetFile, patch } as FilePatchOp
        } else {
          if (!targetFile || fileContent === undefined) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'file_create requires targetFile and content' }) }],
              isError: true,
            }
          }
          operation = { type: 'file_create', file: targetFile, content: fileContent } as FileCreateOp
        }

        const impl: MemoImpl = {
          id: `impl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
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

        // File safety check for external file operations
        if ((action === 'file_patch' || action === 'file_create') && targetFile) {
          const safety = createFileSafety()
          const check = validateFilePath(safety, targetFile)
          if (!check.safe) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: `File safety: ${check.reason}` }) }],
              isError: true,
            }
          }
        }

        // Create snapshot before modification
        writeSnapshot(file, markdown)

        // Execute the operation
        if (action === 'text_replace') {
          if (!parts.body.includes(oldText!)) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: `oldText not found in document body` }) }],
              isError: true,
            }
          }
          parts.body = parts.body.replace(oldText!, newText!)
        } else if (action === 'file_patch') {
          writeMarkdownFile(targetFile!, patch!)
        } else if (action === 'file_create') {
          writeMarkdownFile(targetFile!, fileContent!)
        }

        // Record impl and update memo
        parts.impls.push(impl)
        memo.status = 'done'
        memo.updatedAt = new Date().toISOString()

        // Re-evaluate gates
        if (parts.gates.length > 0) {
          parts.gates = evaluateAllGates(parts.gates, parts.memos)
        }

        // Auto-update cursor
        const resolvedCount = parts.memos.filter(m => isResolved(m.status)).length
        const openMemos = parts.memos.filter(m => !isResolved(m.status))
        parts.cursor = {
          taskId: memoId,
          step: `${resolvedCount}/${parts.memos.length} resolved`,
          nextAction: openMemos.length === 0
            ? 'All annotations resolved — review complete'
            : `Resolve: ${openMemos.map(m => m.id).slice(0, 3).join(', ')}${openMemos.length > 3 ? '...' : ''}`,
          lastSeenHash: generateBodyHash(parts.body),
          updatedAt: new Date().toISOString(),
        }

        const updated = mergeDocument(parts)
        writeMarkdownFile(file, updated)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ impl, memo: { id: memo.id, status: memo.status }, gatesUpdated: parts.gates.length }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
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
    async ({ file, memoId, files: artifactFiles }) => {
      try {
        const markdown = readMarkdownFile(file)
        const parts = splitDocument(markdown)

        const memo = parts.memos.find(m => m.id === memoId)
        if (!memo) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Memo not found: ${memoId}` }) }],
            isError: true,
          }
        }

        const artifact: MemoArtifact = {
          id: `art_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          memoId,
          files: artifactFiles,
          linkedAt: new Date().toISOString(),
        }

        parts.artifacts.push(artifact)

        const updated = mergeDocument(parts)
        writeMarkdownFile(file, updated)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ artifact }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
  )

  // ─── update_memo_progress (v1.1 — update memo progress with status and message) ───
  server.tool(
    'update_memo_progress',
    'Update the progress of a memo with a status change and message. Writes progress to .md-feedback/progress.json and updates the memo status.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      memoId: z.string().describe('The memo ID to update progress for'),
      status: z.enum(['in_progress', 'done', 'failed']).describe('New progress status'),
      message: z.string().describe('Progress message describing what was done or what failed'),
    },
    async ({ file, memoId, status, message }) => {
      try {
        const markdown = readMarkdownFile(file)
        const parts = splitDocument(markdown)

        const memo = parts.memos.find(m => m.id === memoId)
        if (!memo) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Memo not found: ${memoId}` }) }],
            isError: true,
          }
        }

        memo.status = status as MemoStatus
        memo.updatedAt = new Date().toISOString()

        const progressEntry = {
          memoId,
          status,
          message,
          timestamp: new Date().toISOString(),
        }
        appendProgress(file, progressEntry)

        // Re-evaluate gates
        if (parts.gates.length > 0) {
          parts.gates = evaluateAllGates(parts.gates, parts.memos)
        }

        // Auto-update cursor
        const resolvedCount = parts.memos.filter(m => isResolved(m.status)).length
        const openMemos = parts.memos.filter(m => !isResolved(m.status))
        parts.cursor = {
          taskId: memoId,
          step: `${resolvedCount}/${parts.memos.length} resolved`,
          nextAction: openMemos.length === 0
            ? 'All annotations resolved — review complete'
            : `Resolve: ${openMemos.map(m => m.id).slice(0, 3).join(', ')}${openMemos.length > 3 ? '...' : ''}`,
          lastSeenHash: generateBodyHash(parts.body),
          updatedAt: new Date().toISOString(),
        }

        const updated = mergeDocument(parts)
        writeMarkdownFile(file, updated)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ memo: { id: memo.id, status: memo.status }, progressEntry, gatesUpdated: parts.gates.length }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
  )

  // ─── rollback_memo (v1.1 — rollback the latest implementation for a memo) ───
  server.tool(
    'rollback_memo',
    'Rollback the latest implementation for a memo. Reverses text_replace operations (swaps before/after), marks the impl as reverted, and sets the memo status back to open.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      memoId: z.string().describe('The memo ID to rollback'),
    },
    async ({ file, memoId }) => {
      try {
        const markdown = readMarkdownFile(file)
        const parts = splitDocument(markdown)

        const memo = parts.memos.find(m => m.id === memoId)
        if (!memo) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Memo not found: ${memoId}` }) }],
            isError: true,
          }
        }

        // Find the latest impl for this memo
        const memoImpls = parts.impls.filter(imp => imp.memoId === memoId && imp.status === 'applied')
        if (memoImpls.length === 0) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `No applied implementation found for memo: ${memoId}` }) }],
            isError: true,
          }
        }

        const latestImpl = memoImpls[memoImpls.length - 1]

        // Reverse operations
        for (const op of latestImpl.operations) {
          if (op.type === 'text_replace') {
            // Swap before/after to reverse
            if (parts.body.includes(op.after)) {
              parts.body = parts.body.replace(op.after, op.before)
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
        const resolvedCount = parts.memos.filter(m => isResolved(m.status)).length
        const openMemos = parts.memos.filter(m => !isResolved(m.status))
        parts.cursor = {
          taskId: memoId,
          step: `${resolvedCount}/${parts.memos.length} resolved`,
          nextAction: openMemos.length === 0
            ? 'All annotations resolved — review complete'
            : `Resolve: ${openMemos.map(m => m.id).slice(0, 3).join(', ')}${openMemos.length > 3 ? '...' : ''}`,
          lastSeenHash: generateBodyHash(parts.body),
          updatedAt: new Date().toISOString(),
        }

        const updated = mergeDocument(parts)
        writeMarkdownFile(file, updated)

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
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
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
        patch: z.string().optional().describe('For file_patch: the patch content'),
        content: z.string().optional().describe('For file_create: the file content to write'),
      })).describe('Array of operations to apply'),
    },
    async ({ file, operations }) => {
      try {
        const markdown = readMarkdownFile(file)
        const parts = splitDocument(markdown)

        // Snapshot before batch
        writeSnapshot(file, markdown)

        const results: Array<{ memoId: string; implId: string; status: string }> = []

        const safety = createFileSafety()

        for (const op of operations) {
          const memo = parts.memos.find(m => m.id === op.memoId)
          if (!memo) {
            results.push({ memoId: op.memoId, implId: '', status: `error: memo not found` })
            continue
          }

          // File safety check for external file operations
          if ((op.action === 'file_patch' || op.action === 'file_create') && op.targetFile) {
            const check = validateFilePath(safety, op.targetFile)
            if (!check.safe) {
              results.push({ memoId: op.memoId, implId: '', status: `error: file safety: ${check.reason}` })
              continue
            }
          }

          let operation: ImplOperation
          if (op.action === 'text_replace') {
            if (!op.oldText || op.newText === undefined) {
              results.push({ memoId: op.memoId, implId: '', status: 'error: text_replace requires oldText and newText' })
              continue
            }
            operation = { type: 'text_replace', file: '', before: op.oldText, after: op.newText } as TextReplaceOp
            if (!parts.body.includes(op.oldText)) {
              results.push({ memoId: op.memoId, implId: '', status: 'error: oldText not found in body' })
              continue
            }
            parts.body = parts.body.replace(op.oldText, op.newText)
          } else if (op.action === 'file_patch') {
            if (!op.targetFile || !op.patch) {
              results.push({ memoId: op.memoId, implId: '', status: 'error: file_patch requires targetFile and patch' })
              continue
            }
            operation = { type: 'file_patch', file: op.targetFile, patch: op.patch } as FilePatchOp
            writeMarkdownFile(op.targetFile, op.patch)
          } else {
            if (!op.targetFile || op.content === undefined) {
              results.push({ memoId: op.memoId, implId: '', status: 'error: file_create requires targetFile and content' })
              continue
            }
            operation = { type: 'file_create', file: op.targetFile, content: op.content } as FileCreateOp
            writeMarkdownFile(op.targetFile, op.content)
          }

          const impl: MemoImpl = {
            id: `impl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            memoId: op.memoId,
            status: 'applied',
            operations: [operation!],
            summary: `${op.action} for ${op.memoId}`,
            appliedAt: new Date().toISOString(),
          }

          parts.impls.push(impl)
          memo.status = 'done'
          memo.updatedAt = new Date().toISOString()
          results.push({ memoId: op.memoId, implId: impl.id, status: 'applied' })
        }

        // Re-evaluate gates
        if (parts.gates.length > 0) {
          parts.gates = evaluateAllGates(parts.gates, parts.memos)
        }

        // Auto-update cursor
        const resolvedCount = parts.memos.filter(m => isResolved(m.status)).length
        const openMemos = parts.memos.filter(m => !isResolved(m.status))
        parts.cursor = {
          taskId: operations[0]?.memoId || '',
          step: `${resolvedCount}/${parts.memos.length} resolved`,
          nextAction: openMemos.length === 0
            ? 'All annotations resolved — review complete'
            : `Resolve: ${openMemos.map(m => m.id).slice(0, 3).join(', ')}${openMemos.length > 3 ? '...' : ''}`,
          lastSeenHash: generateBodyHash(parts.body),
          updatedAt: new Date().toISOString(),
        }

        // Write transaction record
        writeTransaction(file, { type: 'batch_apply', results, timestamp: new Date().toISOString() })

        const updated = mergeDocument(parts)
        writeMarkdownFile(file, updated)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ results, gatesUpdated: parts.gates.length, cursor: parts.cursor }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
  )

  // ─── get_memo_changes (v1.1 — get implementation history for a memo) ───
  server.tool(
    'get_memo_changes',
    'Get the implementation history and progress for a memo. Returns all MemoImpl records and progress entries from .md-feedback/progress.json. If memoId is omitted, returns all changes.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      memoId: z.string().optional().describe('Optional memo ID to filter by — if omitted, returns all changes'),
    },
    async ({ file, memoId }) => {
      try {
        const markdown = readMarkdownFile(file)
        const parts = splitDocument(markdown)

        const impls = memoId
          ? parts.impls.filter(imp => imp.memoId === memoId)
          : parts.impls

        const allProgress = readProgress(file)
        const progress = memoId
          ? allProgress.filter(p => p.memoId === memoId)
          : allProgress

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ impls, progress }, null, 2),
          }],
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          }],
          isError: true,
        }
      }
    },
  )
}
