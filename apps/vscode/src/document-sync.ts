import * as vscode from 'vscode'
import { convertMemosToHtml, normalizeHighlights, extractHighlightMarks, stripHighlightMarks } from '@md-feedback/shared'
import { splitDocument } from '@md-feedback/shared'
import { evaluateAllGates } from '@md-feedback/shared'
import type { Gate, Checkpoint, PlanCursor } from '@md-feedback/shared'

export interface DocumentSyncStateSetters {
  setPreservedFrontmatter: (value: string) => void
  setPreservedGates: (value: Gate[]) => void
  setPreservedCheckpoints: (value: Checkpoint[]) => void
  setPreservedCursor: (value: PlanCursor | null) => void
}

export interface DocumentSyncHandlers extends DocumentSyncStateSetters {
  postMessage: (msg: Record<string, unknown>) => void
}

export function getActiveMarkdownDocument(): vscode.TextDocument | undefined {
  const editor = vscode.window.activeTextEditor
  if (!editor) return undefined
  if (editor.document.languageId !== 'markdown') return undefined
  return editor.document
}

export function sendDocumentToWebview(
  document: vscode.TextDocument,
  { postMessage, setPreservedFrontmatter, setPreservedGates, setPreservedCheckpoints, setPreservedCursor }: DocumentSyncHandlers,
): void {
  const raw = document.getText()

  try {
    const parts = splitDocument(raw)

    // Preserve metadata for restoration on save
    setPreservedFrontmatter(parts.frontmatter)
    setPreservedGates(parts.gates)
    setPreservedCheckpoints(parts.checkpoints)
    setPreservedCursor(parts.cursor)

    // Strip frontmatter before processing (keep memos for convertMemosToHtml)
    let processed = raw
    if (parts.frontmatter) {
      processed = raw.slice(parts.frontmatter.length)
    }

    const normalized = normalizeHighlights(processed)

    // Extract persisted highlight marks before stripping them
    const highlightMarks = extractHighlightMarks(normalized)
    const withoutHighlights = stripHighlightMarks(normalized)

    const withMemoHtml = convertMemosToHtml(withoutHighlights)

    postMessage({
      type: 'document.load',
      content: raw,
      cleanContent: withMemoHtml,
      highlightMarks,
      filePath: vscode.workspace.asRelativePath(document.uri),
    })

    // Send v0.4.0 status info (cursor + summary)
    sendStatusInfo(raw, postMessage)
  } catch (error) {
    // Fallback: send raw content without processing
    postMessage({
      type: 'document.load',
      content: raw,
      cleanContent: raw,
      filePath: vscode.workspace.asRelativePath(document.uri),
    })
  }
}

/** Extract and send cursor + status summary to webview */
export function sendStatusInfo(raw: string, postMessage: (msg: Record<string, unknown>) => void): void {
  try {
    const parts = splitDocument(raw)
    const gates = evaluateAllGates(parts.gates, parts.memos)

    // Send cursor
    postMessage({ type: 'cursor.update', cursor: parts.cursor })

    // Send status summary
    const openFixes = parts.memos.filter(m => m.type === 'fix' && m.status === 'open').length
    const openQuestions = parts.memos.filter(m => m.type === 'question' && m.status === 'open').length
    const blockedGate = gates.find(g => g.status === 'blocked')
    const allGatesDone = gates.length > 0 && gates.every(g => g.status === 'done')

    const gateStatus = gates.length === 0 ? null
      : blockedGate ? 'blocked'
      : allGatesDone ? 'done'
      : 'proceed'

    if (parts.memos.length > 0 || gates.length > 0) {
      postMessage({
        type: 'status.summary',
        summary: { openFixes, openQuestions, gateStatus },
      })
    }
  } catch {
    // best-effort — don't break document loading
  }
}
