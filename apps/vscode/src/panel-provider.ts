import * as vscode from 'vscode'
import type { TargetFormat } from '@md-feedback/shared'
import type { Gate, Checkpoint, PlanCursor, MemoImpl, MemoArtifact, MemoDependency } from '@md-feedback/shared'
import { getActiveMarkdownDocument, sendDocumentToWebview, sendStatusInfo } from './document-sync'
import { autoSaveExport, handleGenericExport } from './exports'
import { resolveWebviewView } from './panel-view'

export class MdFeedbackPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'md-feedback.panel'
  public static activePanel: MdFeedbackPanelProvider | null = null

  private _view: vscode.WebviewView | undefined
  private currentDocument: vscode.TextDocument | undefined
  private editVersion = 0
  private lastWebviewEditVersion = 0
  private preservedFrontmatter = ''
  private preservedGates: Gate[] = []
  private preservedCheckpoints: Checkpoint[] = []
  private preservedCursor: PlanCursor | null = null
  private preservedImpls: MemoImpl[] = []
  private preservedArtifacts: MemoArtifact[] = []
  private preservedDependencies: MemoDependency[] = []
  private previousGateStatuses = new Map<string, string>()
  private previousNeedsReviewCount = 0

  /** Fired after the first annotation edit has been applied to the document */
  private readonly _onFirstAnnotationApplied = new vscode.EventEmitter<void>()
  readonly onFirstAnnotationApplied = this._onFirstAnnotationApplied.event

  /** Fired when needs_review count changes — used by extension.ts for status bar + CodeLens */
  private readonly _onNeedsReviewCountChanged = new vscode.EventEmitter<number>()
  readonly onNeedsReviewCountChanged = this._onNeedsReviewCountChanged.event

  constructor(private readonly context: vscode.ExtensionContext) {}

  get view(): vscode.WebviewView | undefined {
    return this._view
  }

  public isLatestEditFromWebview(): boolean {
    return this.lastWebviewEditVersion === this.editVersion
  }

  public clearWebviewEditMarker(): void {
    this.lastWebviewEditVersion = 0
  }

  public postMessage(msg: Record<string, unknown>): void {
    if (!this._view) return
    const documentUri = this.currentDocument?.uri.toString() ?? ''
    void this._view.webview.postMessage({ ...msg, documentUri })
  }

  public handleDocumentUpdate(document: vscode.TextDocument): void {
    this.currentDocument = document
    if (!this._view) return
    sendDocumentToWebview(document, {
      postMessage: this.postMessage.bind(this),
      setPreservedFrontmatter: (value) => { this.preservedFrontmatter = value },
      setPreservedGates: (value) => { this.preservedGates = value },
      setPreservedCheckpoints: (value) => { this.preservedCheckpoints = value },
      setPreservedCursor: (value) => { this.preservedCursor = value },
      setPreservedImpls: (value) => { this.preservedImpls = value },
      setPreservedArtifacts: (value) => { this.preservedArtifacts = value },
      setPreservedDependencies: (value) => { this.preservedDependencies = value },
      getPreviousGateStatuses: () => this.previousGateStatuses,
      setPreviousGateStatuses: (value) => { this.previousGateStatuses = value },
      onNeedsReviewCount: (count) => this.updateNeedsReviewCount(count),
    })
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    if (this._view !== webviewView) {
      this._view = webviewView
    }
    resolveWebviewView(webviewView, {
      extensionUri: this.context.extensionUri,
      setActivePanel: () => { MdFeedbackPanelProvider.activePanel = this },
      clearActivePanel: () => {
        if (MdFeedbackPanelProvider.activePanel === this) {
          MdFeedbackPanelProvider.activePanel = null
        }
      },
      postMessage: this.postMessage.bind(this),
      getCurrentDocument: () => this.currentDocument,
      setCurrentDocument: (document) => { this.currentDocument = document },
      getEditVersion: () => this.editVersion,
      incrementEditVersion: () => {
        this.editVersion += 1
        return this.editVersion
      },
      getLastWebviewEditVersion: () => this.lastWebviewEditVersion,
      setLastWebviewEditVersion: (value) => { this.lastWebviewEditVersion = value },
      getPreservedFrontmatter: () => this.preservedFrontmatter,
      getPreservedGates: () => this.preservedGates,
      getPreservedCheckpoints: () => this.preservedCheckpoints,
      getPreservedCursor: () => this.preservedCursor,
      getPreservedImpls: () => this.preservedImpls,
      getPreservedArtifacts: () => this.preservedArtifacts,
      getPreservedDependencies: () => this.preservedDependencies,
      sendDocumentToWebview: this.sendDocumentToWebview.bind(this),
      getActiveMarkdownDocument: this.getActiveMarkdownDocument.bind(this),
      autoSaveExport: this.autoSaveExport.bind(this),
      handleGenericExport: this.handleGenericExport.bind(this),
      sendStatusInfo: this.sendStatusInfo.bind(this),
      getOnboardingDone: () => this.context.globalState.get('md-feedback.onboardingDone', false),
      setOnboardingDone: (value) => this.context.globalState.update('md-feedback.onboardingDone', value),
      getMcpSetupDone: () => this.context.globalState.get('md-feedback.mcpSetupDone', false),
      setMcpSetupDone: (value) => this.context.globalState.update('md-feedback.mcpSetupDone', value),
      fireFirstAnnotationApplied: () => this._onFirstAnnotationApplied.fire(),
    })
  }

  private sendDocumentToWebview(document: vscode.TextDocument): void {
    sendDocumentToWebview(document, {
      postMessage: this.postMessage.bind(this),
      setPreservedFrontmatter: (value) => { this.preservedFrontmatter = value },
      setPreservedGates: (value) => { this.preservedGates = value },
      setPreservedCheckpoints: (value) => { this.preservedCheckpoints = value },
      setPreservedCursor: (value) => { this.preservedCursor = value },
      setPreservedImpls: (value) => { this.preservedImpls = value },
      setPreservedArtifacts: (value) => { this.preservedArtifacts = value },
      setPreservedDependencies: (value) => { this.preservedDependencies = value },
      getPreviousGateStatuses: () => this.previousGateStatuses,
      setPreviousGateStatuses: (value) => { this.previousGateStatuses = value },
      onNeedsReviewCount: (count) => this.updateNeedsReviewCount(count),
    })
  }

  /** Extract and send cursor + status summary to webview */
  private sendStatusInfo(raw: string): void {
    sendStatusInfo(
      raw,
      this.postMessage.bind(this),
      () => this.previousGateStatuses,
      (value) => { this.previousGateStatuses = value },
      (count) => this.updateNeedsReviewCount(count),
    )
  }

  /** Update Activity Bar badge + show toast when items appear for review */
  private updateNeedsReviewCount(count: number): void {
    // Activity Bar badge (#1)
    if (this._view) {
      this._view.badge = count > 0
        ? { value: count, tooltip: `${count} annotation${count > 1 ? 's' : ''} need review` }
        : undefined
    }

    // Toast notification (#3) — only when count increases from 0
    if (count > 0 && this.previousNeedsReviewCount === 0) {
      vscode.window.showInformationMessage(
        `MD Feedback: ${count} annotation${count > 1 ? 's' : ''} ready for review`,
        'Review Now',
      ).then(action => {
        if (action === 'Review Now' && this._view) {
          this._view.show?.(true)
        }
      })
    }
    this.previousNeedsReviewCount = count
    this._onNeedsReviewCountChanged.fire(count)
  }

  private getActiveMarkdownDocument(): vscode.TextDocument | undefined {
    return getActiveMarkdownDocument()
  }

  private async autoSaveExport(document: vscode.TextDocument, target: TargetFormat, content: string, silent = false): Promise<boolean> {
    return autoSaveExport({
      document,
      target,
      content,
      silent,
      postMessage: this.postMessage.bind(this),
    })
  }

  private async handleGenericExport(msg: Record<string, unknown>): Promise<void> {
    return handleGenericExport({
      msg,
      document: this.currentDocument ?? this.getActiveMarkdownDocument(),
      postMessage: this.postMessage.bind(this),
    })
  }
}
