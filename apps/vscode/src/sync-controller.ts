import * as vscode from 'vscode'
import { MdFeedbackPanelProvider } from './panel-provider'
import { createCheckpoint } from '@md-feedback/shared'
import { extractCheckpoints } from '@md-feedback/shared'
import { splitDocument, serializeGate, evaluateAllGates } from '@md-feedback/shared'
import type { Gate } from '@md-feedback/shared'

type DocumentState = {
  lastActivity: number
  hasChanges: boolean
}

type PanelEditVersionAccess = {
  editVersion: number
  lastWebviewEditVersion: number
}

export class SyncController implements vscode.Disposable {
  private switchToken = 0
  private debounceTimer: ReturnType<typeof setTimeout> | undefined
  private checkpointTimer: ReturnType<typeof setInterval> | undefined
  private sectionTrackTimer: ReturnType<typeof setTimeout> | undefined
  private lastTrackedSection: string | undefined
  private currentDocumentUri: vscode.Uri | undefined
  private readonly disposables: vscode.Disposable[] = []
  private readonly docStates = new Map<string, DocumentState>()

  constructor(
    private readonly panelProvider: MdFeedbackPanelProvider,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.context.subscriptions.push(this)

    const activeEditorHandler = vscode.window.onDidChangeActiveTextEditor((editor) => {
      this.handleActiveEditorChange(editor)
    })
    this.disposables.push(activeEditorHandler)
    this.handleActiveEditorChange(vscode.window.activeTextEditor)

    // T2-L2: Track editor cursor → auto-update plan cursor (debounced, annotation-area only)
    const selectionHandler = vscode.window.onDidChangeTextEditorSelection((e) => {
      this.handleSelectionChange(e)
    })
    this.disposables.push(selectionHandler)

    const changeHandler = vscode.workspace.onDidChangeTextDocument((e) => {
      const currentUri = this.currentUri
      if (!currentUri) return
      if (e.document.uri.toString() !== currentUri.toString()) return

      this.markActivity(e.document.uri)

      const edits = this.panelProvider as unknown as PanelEditVersionAccess
      const isWebviewEdit = edits.lastWebviewEditVersion === edits.editVersion
      if (isWebviewEdit) return

      this.panelProvider.handleDocumentUpdate(e.document)
    })
    this.disposables.push(changeHandler)

    this.checkpointTimer = setInterval(() => {
      void this.handleTimerCheckpoint()
    }, 600_000)

    // Listen for first annotation AFTER the edit has been applied (no race condition)
    const firstAnnotationHandler = this.panelProvider.onFirstAnnotationApplied(() => {
      void this.handleFirstAnnotationCheckpoint()
    })
    this.disposables.push(firstAnnotationHandler)
  }

  get currentUri(): vscode.Uri | undefined {
    return this.currentDocumentUri
  }

  currentDocument(): vscode.TextDocument | undefined {
    const uri = this.currentDocumentUri ?? this.getActiveMarkdownDocument()?.uri
    if (!uri) return undefined
    const openDoc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString())
    return openDoc ?? this.getActiveMarkdownDocument()
  }

  async createManualCheckpoint(): Promise<void> {
    const document = this.currentDocument() ?? this.getActiveMarkdownDocument()
    if (!document) {
      vscode.window.showWarningMessage('Open a markdown file to review.')
      return
    }

    const note = await vscode.window.showInputBox({
      prompt: 'Checkpoint note (optional)',
      placeHolder: 'e.g. Architecture section reviewed',
    })

    if (note === undefined) return

    const raw = document.getText()
    const { checkpoint, updatedMarkdown } = createCheckpoint(raw, note || '')
    const success = await this.applyCheckpointEdit(document, updatedMarkdown, 'Failed to create checkpoint.')
    if (!success) return

    this.clearChanges(document.uri)
    this.panelProvider.postMessage({
      type: 'checkpoint.created',
      checkpoint,
      checkpoints: extractCheckpoints(updatedMarkdown),
    })
    vscode.window.showInformationMessage(`Checkpoint created: ${checkpoint.note || checkpoint.id}`)
  }

  /** T2-L2: Selection change → section-aware cursor tracking */
  private handleSelectionChange(e: vscode.TextEditorSelectionChangeEvent): void {
    if (!this.currentDocumentUri) return
    if (e.textEditor.document.uri.toString() !== this.currentDocumentUri.toString()) return
    if (e.textEditor.document.languageId !== 'markdown') return

    if (this.sectionTrackTimer) clearTimeout(this.sectionTrackTimer)
    this.sectionTrackTimer = setTimeout(() => {
      this.updateCursorFromSelection(e.textEditor)
    }, 3000)
  }

  private updateCursorFromSelection(editor: vscode.TextEditor): void {
    const doc = editor.document
    const cursorLine = editor.selection.active.line

    // Walk upward to find enclosing h2 section
    let sectionName: string | undefined
    for (let i = cursorLine; i >= 0; i--) {
      const match = doc.lineAt(i).text.match(/^## (.+)/)
      if (match) { sectionName = match[1].trim(); break }
    }
    if (!sectionName) return
    if (sectionName === this.lastTrackedSection) return

    // Only fire if section contains annotations
    const raw = doc.getText()
    const sectionStart = raw.indexOf(`## ${sectionName}`)
    if (sectionStart === -1) return
    const nextSection = raw.indexOf('\n## ', sectionStart + 1)
    const sectionText = nextSection === -1 ? raw.slice(sectionStart) : raw.slice(sectionStart, nextSection)
    if (!sectionText.includes('<!-- USER_MEMO')) return

    this.lastTrackedSection = sectionName
    const allH2 = raw.match(/^## .+/gm) || []
    const idx = allH2.findIndex(h => h.includes(sectionName!)) + 1

    this.panelProvider.postMessage({
      type: 'cursor.update',
      cursor: {
        taskId: sectionName,
        step: `${idx}/${allH2.length}`,
        nextAction: `Reviewing: ${sectionName}`,
        lastSeenHash: '',
        updatedAt: new Date().toISOString(),
      },
    })
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    if (this.checkpointTimer) clearInterval(this.checkpointTimer)
    if (this.sectionTrackTimer) clearTimeout(this.sectionTrackTimer)
    while (this.disposables.length) {
      const item = this.disposables.pop()
      if (item) item.dispose()
    }
    this.docStates.clear()
  }

  private handleActiveEditorChange(editor: vscode.TextEditor | undefined): void {
    const myToken = ++this.switchToken
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      if (this.switchToken !== myToken) return

      if (!editor || editor.document.languageId !== 'markdown') {
        // Don't clear sidebar when switching to non-markdown file — keep showing last .md
        // Only clear if there are no open markdown documents at all
        if (this.currentDocumentUri) {
          const stillOpen = vscode.workspace.textDocuments.some(
            d => d.languageId === 'markdown' && !d.isClosed,
          )
          if (stillOpen) return // Keep current content visible
        }
        this.currentDocumentUri = undefined
        this.panelProvider.postMessage({ type: 'document.empty' })
        return
      }

      // Only reload if switching to a different .md file
      if (this.currentDocumentUri?.toString() === editor.document.uri.toString()) return

      this.currentDocumentUri = editor.document.uri
      this.ensureState(editor.document.uri)
      this.panelProvider.handleDocumentUpdate(editor.document)
    }, 150)
  }

  private async handleFirstAnnotationCheckpoint(): Promise<void> {
    // Called from panelProvider.onFirstAnnotationApplied — the edit has already
    // been applied and saved, so document.getText() returns up-to-date content.
    const document = this.currentDocument() ?? this.getActiveMarkdownDocument()
    if (!document) return
    await this.createAutoCheckpoint(document, 'first-annotation')
    await this.createAutoGate(document)
  }

  /** T3: Auto-create a gate on first annotation if none exists */
  private async createAutoGate(document: vscode.TextDocument): Promise<void> {
    if (document.isClosed) return
    try {
      const raw = document.getText()
      const parts = splitDocument(raw)
      if (parts.gates.length > 0) return // Already has gates

      const gate: Gate = {
        id: `gate-${Date.now().toString(36)}`,
        type: 'merge',
        status: 'blocked',
        blockedBy: [],            // Track ALL memos globally
        canProceedIf: '',
        doneDefinition: 'All review annotations resolved',
      }

      const serialized = serializeGate(gate)
      const edit = new vscode.WorkspaceEdit()
      edit.insert(document.uri, document.positionAt(raw.length), '\n\n' + serialized)
      const success = await vscode.workspace.applyEdit(edit)
      if (!success) return

      // Push evaluated gate to webview
      const updatedRaw = document.getText()
      const updatedParts = splitDocument(updatedRaw)
      const evaluatedGates = evaluateAllGates(updatedParts.gates, updatedParts.memos)
      this.panelProvider.postMessage({ type: 'gates.update', gates: evaluatedGates })
    } catch {
      // Silently skip — auto-gate should never show errors
    }
  }

  private async handleTimerCheckpoint(): Promise<void> {
    const document = this.currentDocument() ?? this.getActiveMarkdownDocument()
    if (!document) return

    const key = document.uri.toString()
    const state = this.docStates.get(key)
    if (!state || !state.hasChanges) return

    await this.createAutoCheckpoint(document, 'timer')
  }

  private async createAutoCheckpoint(
    document: vscode.TextDocument,
    reason: 'first-annotation' | 'timer',
  ): Promise<void> {
    // Silently skip if document is closed or unavailable
    if (document.isClosed) return
    try {
      const raw = document.getText()
      const { checkpoint, updatedMarkdown } = createCheckpoint(raw, 'auto')
      const success = await this.applyCheckpointEdit(document, updatedMarkdown)
      if (!success) return

      this.clearChanges(document.uri)
      this.panelProvider.postMessage({
        type: 'checkpoint.auto',
        reason,
        checkpoint,
        checkpoints: extractCheckpoints(updatedMarkdown),
      })
    } catch {
      // Silently skip — auto-checkpoints should never show errors to the user
    }
  }

  private async applyCheckpointEdit(
    document: vscode.TextDocument,
    updatedMarkdown: string,
    errorMessage?: string,
  ): Promise<boolean> {
    const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === document.uri.toString())
    const selection = editor?.selection
    const visibleRange = editor?.visibleRanges[0]

    const edit = new vscode.WorkspaceEdit()
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      updatedMarkdown,
    )

    try {
      const success = await vscode.workspace.applyEdit(edit)
      if (!success) {
        if (errorMessage) vscode.window.showErrorMessage(errorMessage)
        return false
      }
    } catch {
      if (errorMessage) vscode.window.showErrorMessage(errorMessage)
      return false
    }

    if (editor) {
      try {
        if (selection) editor.selection = selection
        if (visibleRange) {
          editor.revealRange(visibleRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
        }
      } catch {
        // best-effort restore
      }
    }

    return true
  }

  private ensureState(uri: vscode.Uri): DocumentState {
    const key = uri.toString()
    const existing = this.docStates.get(key)
    if (existing) return existing
    const state: DocumentState = { lastActivity: Date.now(), hasChanges: false }
    this.docStates.set(key, state)
    return state
  }

  private markActivity(uri: vscode.Uri): void {
    const state = this.ensureState(uri)
    state.lastActivity = Date.now()
    state.hasChanges = true
  }

  private clearChanges(uri: vscode.Uri): void {
    const state = this.ensureState(uri)
    state.lastActivity = Date.now()
    state.hasChanges = false
  }

  private getActiveMarkdownDocument(): vscode.TextDocument | undefined {
    const editor = vscode.window.activeTextEditor
    if (!editor) return undefined
    if (editor.document.languageId !== 'markdown') return undefined
    return editor.document
  }
}
