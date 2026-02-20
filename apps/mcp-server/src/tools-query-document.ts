import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  buildHandoffDocument,
  evaluateAllGates,
  extractCheckpoints,
  formatHandoffMarkdown,
  getAllSections,
  getAnnotationCounts,
  getSectionsWithAnnotations,
  parseHandoffFile,
  splitDocument,
} from '@md-feedback/shared'
import type { ReviewDocument } from '@md-feedback/shared'
import { computeMetrics } from './metrics.js'
import type { QueryToolContext } from './tools-runtime.js'
import { InvalidHandoffError } from './errors.js'
import { getPolicySnapshot } from './policy.js'
import { getMemoSeverityStatus, getWorkflowState } from './workflow.js'

export function registerDocumentQueryTools(server: McpServer, ctx: QueryToolContext): void {
  const { safeRead, wrapTool, listDocuments } = ctx

  // ─── list_documents ───
  server.tool(
    'list_documents',
    'List markdown files in the workspace. Optionally filter to only files that already contain annotations.',
    {
      annotatedOnly: z.boolean().optional().default(false).describe('If true, return only files containing USER_MEMO/HIGHLIGHT_MARK annotations'),
      maxFiles: z.number().int().min(1).max(5000).optional().default(500).describe('Maximum number of files to return'),
    },
    async ({ annotatedOnly, maxFiles }) => wrapTool(async () => {
      const files = listDocuments({ annotatedOnly, maxFiles })
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ files, total: files.length }, null, 2),
        }],
      }
    }),
  )

  // ─── get_policy_status ───
  server.tool(
    'get_policy_status',
    'Return current runtime policy profile and memo-action routing rules.',
    {},
    async () => wrapTool(async () => {
      const policy = getPolicySnapshot()
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ policy }, null, 2),
        }],
      }
    }),
  )

  // ─── get_workflow_status ───
  server.tool(
    'get_workflow_status',
    'Return current workflow phase and transition history for a document.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
    },
    async ({ file }) => wrapTool(async () => {
      // Ensure file is in safe workspace before reading sidecar workflow state.
      safeRead(file)
      const workflow = getWorkflowState(file)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ workflow }, null, 2),
        }],
      }
    }),
  )

  // ─── get_severity_status ───
  server.tool(
    'get_severity_status',
    'Return memo severity overrides and unresolved blocking memo IDs for the document.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
    },
    async ({ file }) => wrapTool(async () => {
      safeRead(file)
      const severity = getMemoSeverityStatus(file)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ severity }, null, 2),
        }],
      }
    }),
  )

  // ─── get_checkpoints ───
  server.tool(
    'get_checkpoints',
    'List all checkpoints in an annotated markdown file.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
    },
    async ({ file }) => wrapTool(async () => {
      const markdown = safeRead(file)
      const checkpoints = extractCheckpoints(markdown)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ checkpoints }, null, 2),
        }],
      }
    }),
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
    async ({ file, target }) => wrapTool(async () => {
      const markdown = safeRead(file)
      const doc = buildHandoffDocument(markdown, file)
      const handoff = formatHandoffMarkdown(doc, target || 'standalone')
      return {
        content: [{
          type: 'text' as const,
          text: handoff,
        }],
      }
    }),
  )

  // ─── get_review_status ───
  server.tool(
    'get_review_status',
    'Get current review session status: annotation counts, checkpoints, and reviewed sections. Summary-only — returns counts and metadata, not individual memos. Use list_annotations for memo details or get_document_structure for the full parse.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
    },
    async ({ file }) => wrapTool(async () => {
      const markdown = safeRead(file)
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
    }),
  )

  // ─── pickup_handoff ───
  server.tool(
    'pickup_handoff',
    'Parse an existing handoff document to resume a review session. Returns structured data for session continuity.',
    {
      file: z.string().describe('Path to the handoff markdown file'),
    },
    async ({ file }) => wrapTool(async () => {
      const markdown = safeRead(file)
      const doc = parseHandoffFile(markdown)
      if (!doc) {
        throw new InvalidHandoffError(file)
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(doc, null, 2),
        }],
      }
    }),
  )

  // ─── list_annotations ───
  server.tool(
    'list_annotations',
    'List all annotations (USER_MEMO comments) in a markdown file. Returns structured array with id, type, status, owner, text, and color. Lightweight — returns only memo data, no document body or sections. Use get_document_structure for the full parse.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
    },
    async ({ file }) => wrapTool(async () => {
      const markdown = safeRead(file)
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
    }),
  )

  // ─── get_document_structure ───
  server.tool(
    'get_document_structure',
    'Parse an annotated markdown file and return v0.4.0 ReviewDocument metadata. By default bodyMd is omitted to reduce context size; set includeBody=true only when full body is required.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      includeBody: z.boolean().optional().default(false).describe('Include full bodyMd content (larger payload)'),
    },
    async ({ file, includeBody }) => wrapTool(async () => {
      const markdown = safeRead(file)
      const parts = splitDocument(markdown)
      const allSections = getAllSections(markdown)
      const reviewedSections = getSectionsWithAnnotations(markdown)

      const gates = evaluateAllGates(parts.gates, parts.memos)

      let open = 0
      let inProgress = 0
      let needsReview = 0
      let answered = 0
      let done = 0
      let failed = 0
      let wontfix = 0
      let fixes = 0
      let questions = 0
      let highlights = 0
      for (const memo of parts.memos) {
        if (memo.status === 'open') open++
        else if (memo.status === 'in_progress') inProgress++
        else if (memo.status === 'needs_review') needsReview++
        else if (memo.status === 'answered') answered++
        else if (memo.status === 'done') done++
        else if (memo.status === 'failed') failed++
        else if (memo.status === 'wontfix') wontfix++

        if (memo.type === 'fix') fixes++
        else if (memo.type === 'question') questions++
        else highlights++
      }

      let blocked = 0
      for (const gate of gates) {
        if (gate.status === 'blocked') blocked++
      }

      const structure: ReviewDocument = {
        version: '0.4.0',
        file,
        bodyMd: includeBody ? parts.body : '',
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
          needsReview,
          answered,
          done,
          failed,
          wontfix,
          blocked,
          fixes,
          questions,
          highlights,
        },
      }

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
    }),
  )

  // ─── evaluate_gates ───
  server.tool(
    'evaluate_gates',
    'Evaluate all gates in a markdown file against current memo statuses. Returns updated gate statuses without modifying the file.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
    },
    async ({ file }) => wrapTool(async () => {
      const markdown = safeRead(file)
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
    }),
  )
}
