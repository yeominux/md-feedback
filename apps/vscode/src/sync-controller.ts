import * as vscode from 'vscode'
import { MdFeedbackPanelProvider } from './panel-provider'
import { createCheckpoint } from '@md-feedback/shared'
import { extractCheckpoints } from '@md-feedback/shared'
import { generateId } from '@md-feedback/shared'
import { splitDocument, serializeGate, evaluateAllGates } from '@md-feedback/shared'
import type { Gate } from '@md-feedback/shared'

type DocumentState = {
  lastActivity: number
  hasChanges: boolean
}

const DEFAULT_AUTO_CHECKPOINT_INTERVAL_MS = 600_000
const DEFAULT_SECTION_TRACK_DEBOUNCE_MS = 3000
const DEFAULT_EDITOR_SWITCH_DEBOUNCE_MS = 150
const DEFAULT_FILE_WATCH_DEBOUNCE_MS = 150

type TimingConfig = {
  autoCheckpointIntervalMs: number
  sectionTrackDebounceMs: number
  editorSwitchDebounceMs: number
  fileWatchDebounceMs: number
}

function positiveMsOrDefault(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function readTimingConfig(): TimingConfig {
  const config = vscode.workspace.getConfiguration('md-feedback')
  return {
    autoCheckpointIntervalMs: positiveMsOrDefault(
      config.get<number>('autoCheckpointIntervalMs'),
      DEFAULT_AUTO_CHECKPOINT_INTERVAL_MS,
    ),
    sectionTrackDebounceMs: positiveMsOrDefault(
      config.get<number>('sectionTrackDebounceMs'),
      DEFAULT_SECTION_TRACK_DEBOUNCE_MS,
    ),
    editorSwitchDebounceMs: positiveMsOrDefault(
      config.get<number>('editorSwitchDebounceMs'),
      DEFAULT_EDITOR_SWITCH_DEBOUNCE_MS,
    ),
    fileWatchDebounceMs: positiveMsOrDefault(
      config.get<number>('fileWatchDebounceMs'),
      DEFAULT_FILE_WATCH_DEBOUNCE_MS,
    ),
  }
}

export class SyncController implements vscode.Disposable {
  private switchToken = 0
  private debounceTimer: ReturnType<typeof setTimeout> | undefined
  private checkpointTimer: ReturnType<typeof setInterval> | undefined
  private sectionTrackTimer: ReturnType<typeof setTimeout> | undefined
  private lastTrackedSection: string | undefined
  private currentDocumentUri: vscode.Uri | undefined
  private fileWatcher: vscode.FileSystemWatcher | undefined
  private fileWatchDebounce: ReturnType<typeof setTimeout> | undefined
  private echoGuardTimer: ReturnType<typeof setTimeout> | undefined
  private skipNextFileWatch = false
  private readonly disposables: vscode.Disposable[] = []
  private readonly docStates = new Map<string, DocumentState>()
  private readonly timing: TimingConfig

  constructor(
    private readonly panelProvider: MdFeedbackPanelProvider,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.timing = readTimingConfig()
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

      const isWebviewEdit = this.panelProvider.isLatestEditFromWebview()
      if (isWebviewEdit) {
        this.skipNextFileWatch = true
        // Auto-clear echo-loop guards after 1s — only the immediate
        // file-watcher event from this same edit should be suppressed.
        // Without this, external edits (e.g. MCP tools) are blocked
        // until the user toggles panel visibility.
        if (this.echoGuardTimer) clearTimeout(this.echoGuardTimer)
        this.echoGuardTimer = setTimeout(() => {
          this.skipNextFileWatch = false
          this.panelProvider.clearWebviewEditMarker()
        }, 1000)
        return
      }

      this.panelProvider.handleDocumentUpdate(e.document)
    })
    this.disposables.push(changeHandler)

    this.checkpointTimer = setInterval(() => {
      void this.handleTimerCheckpoint()
    }, this.timing.autoCheckpointIntervalMs)

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
    }, this.timing.sectionTrackDebounceMs)
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
    if (this.fileWatchDebounce) clearTimeout(this.fileWatchDebounce)
    if (this.echoGuardTimer) clearTimeout(this.echoGuardTimer)
    if (this.fileWatcher) { this.fileWatcher.dispose(); this.fileWatcher = undefined }
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
      this.watchFile(editor.document.uri)
      this.panelProvider.handleDocumentUpdate(editor.document)
    }, this.timing.editorSwitchDebounceMs)
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
        id: generateId('gate'),
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

  /** Watch the current markdown file for external changes (e.g. AI agent writing via MCP) */
  private watchFile(uri: vscode.Uri): void {
    // Dispose previous watcher
    if (this.fileWatcher) { this.fileWatcher.dispose(); this.fileWatcher = undefined }

    // createFileSystemWatcher needs a glob — watch the specific file by name in its parent dir
    const fileName = vscode.workspace.asRelativePath(uri, false).split(/[\\/]/).pop()!
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.joinPath(uri, '..'), fileName),
    )

    this.fileWatcher.onDidChange(() => {
      this.handleExternalFileChange()
    })
  }

  private handleExternalFileChange(): void {
    if (this.fileWatchDebounce) clearTimeout(this.fileWatchDebounce)
    this.fileWatchDebounce = setTimeout(async () => {
      // Skip exactly one watcher event after a webview-originated document change.
      if (this.skipNextFileWatch || this.panelProvider.isLatestEditFromWebview()) {
        this.skipNextFileWatch = false
        this.panelProvider.clearWebviewEditMarker()
        return
      }

      const document = this.currentDocument()
      if (!document) return

      // If webview has unsaved edits, confirm before overwriting with external changes
      if (this.panelProvider.webviewIsDirty) {
        const choice = await vscode.window.showWarningMessage(
          'The file was modified externally. Reload will discard your unsaved webview changes.',
          { modal: true },
          'Reload',
          'Keep Mine',
        )
        if (choice !== 'Reload') return
        this.panelProvider.webviewIsDirty = false
      }

      this.panelProvider.handleDocumentUpdate(document)
    }, this.timing.fileWatchDebounceMs)
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
