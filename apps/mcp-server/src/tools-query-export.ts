import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  buildHandoffDocument,
  formatHandoffMarkdown,
  generateContext,
  getAllSections,
  splitDocument,
  type TargetFormat,
} from '@md-feedback/shared'
import type { ReviewHighlight, ReviewMemo } from '@md-feedback/shared'
import { readProgress } from './file-ops.js'
import type { QueryToolContext } from './tools-runtime.js'

export function registerExportQueryTools(server: McpServer, ctx: QueryToolContext): void {
  const { safeRead, splitWithSidecar, wrapTool } = ctx
  const readParts = (file: string) => {
    if (typeof splitWithSidecar === 'function') return splitWithSidecar(file)
    return splitDocument(safeRead(file))
  }

  // ─── export_review ───
  server.tool(
    'export_review',
    'Export review feedback in a format optimized for a specific AI coding tool. Targets: claude-code, cursor, codex, copilot, cline, windsurf, roo-code, gemini, antigravity, generic, handoff. Returns formatted markdown ready to save to the appropriate file.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      target: z.enum(['claude-code', 'cursor', 'codex', 'copilot', 'cline', 'windsurf', 'roo-code', 'gemini', 'antigravity', 'generic', 'handoff']).describe('Target AI tool format'),
    },
    async ({ file, target }) => wrapTool(async () => {
      const markdown = safeRead(file)

      if (target === 'handoff') {
        const doc = buildHandoffDocument(markdown, file)
        const handoff = formatHandoffMarkdown(doc, 'standalone')
        return { content: [{ type: 'text' as const, text: handoff }] }
      }

      const parts = readParts(file)
      const memos = parts.memos
      const allSections = getAllSections(markdown)
      const docTitle = allSections[0] || 'Plan Review'

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
    }),
  )

  // ─── get_memo_changes ───
  server.tool(
    'get_memo_changes',
    'Get the implementation history and progress for a memo. Returns all MemoImpl records and progress entries from .md-feedback/progress.json. If memoId is omitted, returns all changes.',
    {
      file: z.string().describe('Path to the annotated markdown file'),
      memoId: z.string().optional().describe('Optional memo ID to filter by — if omitted, returns all changes'),
    },
    async ({ file, memoId }) => wrapTool(async () => {
      const parts = readParts(file)

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
    }),
  )
}
