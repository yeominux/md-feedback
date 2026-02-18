import * as vscode from 'vscode'
import { splitDocument, mergeDocument } from '@md-feedback/shared'

const MEMO_PATTERN = /<!-- USER_MEMO\b[^>]*?id="([^"]+)"[^>]*?status="needs_review"[^>]*?-->/gs

/**
 * CodeLens provider for approve/reject actions on needs_review annotations.
 * Shows "Approve | Request Changes | Reject" directly in the markdown editor,
 * above each annotation that has status="needs_review".
 */
export class ReviewCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChange = new vscode.EventEmitter<void>()
  readonly onDidChangeCodeLenses = this._onDidChange.event

  refresh(): void {
    this._onDidChange.fire()
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.languageId !== 'markdown') return []

    const lenses: vscode.CodeLens[] = []
    const text = document.getText()
    let match: RegExpExecArray | null

    MEMO_PATTERN.lastIndex = 0
    while ((match = MEMO_PATTERN.exec(text)) !== null) {
      const memoId = match[1]
      const pos = document.positionAt(match.index)
      const range = new vscode.Range(pos, pos)

      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(check) Approve',
          command: 'md-feedback.approveMemo',
          arguments: [document.uri, memoId],
        }),
        new vscode.CodeLens(range, {
          title: '$(sync) Request Changes',
          command: 'md-feedback.requestChangesMemo',
          arguments: [document.uri, memoId],
        }),
        new vscode.CodeLens(range, {
          title: '$(x) Reject',
          command: 'md-feedback.rejectMemo',
          arguments: [document.uri, memoId],
        }),
      )
    }

    return lenses
  }
}

/** Update a memo's status in the document and save */
export async function updateMemoStatusInDocument(
  uri: vscode.Uri,
  memoId: string,
  newStatus: string,
): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri)
  const raw = document.getText()
  const parts = splitDocument(raw)

  const memo = parts.memos.find(m => m.id === memoId)
  if (!memo) return

  memo.status = newStatus as typeof memo.status
  memo.updatedAt = new Date().toISOString()

  const updated = mergeDocument(parts)
  const edit = new vscode.WorkspaceEdit()
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(raw.length),
  )
  edit.replace(uri, fullRange, updated)
  await vscode.workspace.applyEdit(edit)
  await document.save()
}

/** Find the nearest needs_review memo to the cursor and apply a status */
export async function updateNearestMemo(newStatus: string): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || editor.document.languageId !== 'markdown') return

  const text = editor.document.getText()
  const cursorOffset = editor.document.offsetAt(editor.selection.active)

  MEMO_PATTERN.lastIndex = 0
  let nearest: { id: string; distance: number } | null = null
  let match: RegExpExecArray | null

  while ((match = MEMO_PATTERN.exec(text)) !== null) {
    const distance = Math.abs(match.index - cursorOffset)
    if (!nearest || distance < nearest.distance) {
      nearest = { id: match[1], distance }
    }
  }

  if (nearest) {
    await updateMemoStatusInDocument(editor.document.uri, nearest.id, newStatus)
  }
}
