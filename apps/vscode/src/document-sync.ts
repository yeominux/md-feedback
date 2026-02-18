import * as vscode from 'vscode'
import { convertMemosToHtml, normalizeHighlights, extractHighlightMarks, stripHighlightMarks } from '@md-feedback/shared'
import { splitDocument } from '@md-feedback/shared'
import { evaluateAllGates } from '@md-feedback/shared'
import type { Gate, Checkpoint, PlanCursor, MemoImpl, MemoArtifact, MemoDependency } from '@md-feedback/shared'

export interface DocumentSyncStateSetters {
  setPreservedFrontmatter: (value: string) => void
  setPreservedGates: (value: Gate[]) => void
  setPreservedCheckpoints: (value: Checkpoint[]) => void
  setPreservedCursor: (value: PlanCursor | null) => void
  setPreservedImpls: (value: MemoImpl[]) => void
  setPreservedArtifacts: (value: MemoArtifact[]) => void
  setPreservedDependencies: (value: MemoDependency[]) => void
}

export interface DocumentSyncHandlers extends DocumentSyncStateSetters {
  postMessage: (msg: Record<string, unknown>) => void
  getPreviousGateStatuses?: () => Map<string, string>
  setPreviousGateStatuses?: (value: Map<string, string>) => void
  onNeedsReviewCount?: (count: number) => void
}

export function getActiveMarkdownDocument(): vscode.TextDocument | undefined {
  const editor = vscode.window.activeTextEditor
  if (!editor) return undefined
  if (editor.document.languageId !== 'markdown') return undefined
  return editor.document
}

export function sendDocumentToWebview(
  document: vscode.TextDocument,
  handlers: DocumentSyncHandlers,
): void {
  const { postMessage, setPreservedFrontmatter, setPreservedGates, setPreservedCheckpoints, setPreservedCursor, setPreservedImpls, setPreservedArtifacts, setPreservedDependencies } = handlers
  const raw = document.getText()

  try {
    const parts = splitDocument(raw)

    // Preserve metadata for restoration on save
    setPreservedFrontmatter(parts.frontmatter)
    setPreservedGates(parts.gates)
    setPreservedCheckpoints(parts.checkpoints)
    setPreservedCursor(parts.cursor)
    setPreservedImpls(parts.impls)
    setPreservedArtifacts(parts.artifacts)
    setPreservedDependencies(parts.dependencies)

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
    sendStatusInfo(raw, postMessage, handlers.getPreviousGateStatuses, handlers.setPreviousGateStatuses)
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

/** Extract and send cursor + status summary + metadata to webview */
export function sendStatusInfo(
  raw: string,
  postMessage: (msg: Record<string, unknown>) => void,
  getPreviousGateStatuses?: () => Map<string, string>,
  setPreviousGateStatuses?: (value: Map<string, string>) => void,
  onNeedsReviewCount?: (count: number) => void,
): void {
  try {
    const parts = splitDocument(raw)
    const gates = evaluateAllGates(parts.gates, parts.memos)

    // Detect gate transitions and show toast notifications
    if (getPreviousGateStatuses && setPreviousGateStatuses && gates.length > 0) {
      const prev = getPreviousGateStatuses()
      for (const gate of gates) {
        const prevStatus = prev.get(gate.id)
        if (prevStatus && prevStatus !== gate.status) {
          if ((prevStatus === 'blocked' && gate.status === 'proceed') || gate.status === 'done') {
            vscode.window.showInformationMessage(
              `Gate "${gate.id}" is now ${gate.status}`,
              'Open Document',
            )
          }
        }
      }
      const newStatuses = new Map<string, string>()
      for (const gate of gates) newStatuses.set(gate.id, gate.status)
      setPreviousGateStatuses(newStatuses)
    }

    // Send cursor
    postMessage({ type: 'cursor.update', cursor: parts.cursor })

    // Send status summary (extended with totals for status bar)
    const openFixes = parts.memos.filter(m => m.type === 'fix' && m.status === 'open').length
    const openQuestions = parts.memos.filter(m => m.type === 'question' && m.status === 'open').length
    const totalMemos = parts.memos.length
    const resolvedMemos = parts.memos.filter(m => m.status !== 'open' && m.status !== 'in_progress' && m.status !== 'needs_review').length
    const needsReviewMemos = parts.memos.filter(m => m.status === 'needs_review').length
    const inProgressMemos = parts.memos.filter(m => m.status === 'in_progress').length
    const doneMemos = parts.memos.filter(m => m.status === 'done').length
    const failedMemos = parts.memos.filter(m => m.status === 'failed').length
    const blockedGate = gates.find(g => g.status === 'blocked')
    const allGatesDone = gates.length > 0 && gates.every(g => g.status === 'done')

    const gateStatus = gates.length === 0 ? null
      : blockedGate ? 'blocked'
      : allGatesDone ? 'done'
      : 'proceed'

    if (parts.memos.length > 0 || gates.length > 0) {
      postMessage({
        type: 'status.summary',
        summary: { openFixes, openQuestions, gateStatus, totalMemos, resolvedMemos, needsReviewMemos, inProgressMemos, doneMemos, failedMemos },
      })
    }

    // Notify extension host of needs_review count (for badge + status bar)
    if (onNeedsReviewCount) {
      onNeedsReviewCount(needsReviewMemos)
    }

    // Send metadata for drawer (gates, cursor, checkpoints, impls, artifacts, dependencies)
    postMessage({
      type: 'metadata.update',
      gates,
      cursor: parts.cursor,
      checkpoints: parts.checkpoints,
      impls: parts.impls,
      artifacts: parts.artifacts,
      dependencies: parts.dependencies,
    })
  } catch {
    // best-effort — don't break document loading
  }
}
