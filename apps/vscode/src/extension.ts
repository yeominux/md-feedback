import * as vscode from 'vscode'
import { MdFeedbackPanelProvider } from './panel-provider'
import { SyncController } from './sync-controller'
import { registerExportCommands } from './export-commands'
import { ReviewCodeLensProvider, updateMemoStatusInDocument, updateNearestMemo, approveAllNeedsReview } from './review-codelens'
import { computeLineHash, evaluateAllGates, generateBodyHash, generateId, mergeDocument, splitDocument } from '@md-feedback/shared'
import type { MemoColor, MemoType, MemoV2 } from '@md-feedback/shared'

async function addAnnotationFromSelection(type: MemoType, color: MemoColor): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || editor.document.languageId !== 'markdown') {
    void vscode.window.showWarningMessage('Open a markdown file to annotate.')
    return
  }

  const selection = editor.selection
  if (selection.isEmpty) {
    void vscode.window.showInformationMessage('Select text first, then press 1, 2, or 3.')
    return
  }

  const anchorText = editor.document.getText(selection).trim()
  if (anchorText.length < 2) {
    void vscode.window.showInformationMessage('Select at least 2 characters to annotate.')
    return
  }

  const raw = editor.document.getText()
  const parts = splitDocument(raw)
  const anchorLineText = editor.document.lineAt(selection.start.line).text
  const timestamp = new Date().toISOString()
  const memo: MemoV2 = {
    id: generateId('memo'),
    type,
    status: 'open',
    owner: 'human',
    source: 'vscode',
    color,
    text: type === 'fix'
      ? 'Needs change'
      : type === 'question'
        ? 'Needs clarification'
        : 'Reference highlight',
    anchorText,
    anchor: `L${selection.start.line + 1}:L${selection.start.line + 1}|${computeLineHash(anchorLineText)}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  parts.memos.push(memo)
  if (parts.gates.length === 0) {
    parts.gates.push({
      id: generateId('gate'),
      type: 'merge',
      status: 'blocked',
      blockedBy: [],
      canProceedIf: '',
      doneDefinition: 'All review annotations resolved',
    })
  }
  parts.gates = evaluateAllGates(parts.gates, parts.memos)
  const resolvedCount = parts.memos.filter(m => ['answered', 'done', 'failed', 'wontfix'].includes(m.status)).length
  const appliedCount = parts.memos.filter(m => m.status !== 'open').length
  parts.cursor = {
    taskId: memo.id,
    step: `${appliedCount} applied, ${resolvedCount}/${parts.memos.length} resolved`,
    nextAction: `Review: ${memo.id}`,
    lastSeenHash: generateBodyHash(parts.body),
    updatedAt: timestamp,
  }

  const updated = mergeDocument(parts)
  const edit = new vscode.WorkspaceEdit()
  edit.replace(
    editor.document.uri,
    new vscode.Range(0, 0, editor.document.lineCount, 0),
    updated,
  )
  const applied = await vscode.workspace.applyEdit(edit)
  if (!applied) {
    void vscode.window.showErrorMessage('Failed to add annotation.')
    return
  }
  void editor.document.save()
}

export function activate(context: vscode.ExtensionContext) {
  const extensionVersion = String(context.extension.packageJSON.version ?? '0.0.0')

  // 1. WebviewViewProvider registration
  const panelProvider = new MdFeedbackPanelProvider(context)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('md-feedback.panel', panelProvider)
  )
  context.subscriptions.push(
    vscode.commands.registerCommand('md-feedback.panel.focus', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.md-feedback')
    }),
  )

  // 2. SyncController initialization
  const syncController = new SyncController(panelProvider, context)
  context.subscriptions.push(syncController)

  // 3. Export commands registration (4 targets)
  registerExportCommands(context)

  // 4. Checkpoint command (manual — Command Palette only)
  context.subscriptions.push(
    vscode.commands.registerCommand('md-feedback.checkpoint', () => {
      syncController.createManualCheckpoint()
    })
  )

  // 5. Show Onboarding command — re-show the onboarding banner
  context.subscriptions.push(
    vscode.commands.registerCommand('md-feedback.showOnboarding', async () => {
      await context.globalState.update('md-feedback.onboardingDone', false)
      panelProvider.postMessage({ type: 'onboarding.state', done: false })
      vscode.window.showInformationMessage('MD Feedback: Onboarding guide re-enabled.')
    })
  )

  // 6. Status bar item — shows needs_review count
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50)
  statusBarItem.command = 'md-feedback.panel.focus'
  statusBarItem.tooltip = 'MD Feedback: Click to open review panel'
  context.subscriptions.push(statusBarItem)

  // Update status bar when panel reports needs_review count
  panelProvider.onNeedsReviewCountChanged((count) => {
    if (count > 0) {
      statusBarItem.text = `$(eye) ${count} reviews`
      // Removed warningBackground to respect VS Code UX hierarchy
      statusBarItem.backgroundColor = undefined
      statusBarItem.show()
    } else {
      statusBarItem.text = '$(eye) MD Feedback'
      statusBarItem.backgroundColor = undefined
      statusBarItem.hide()
    }
    // Refresh CodeLens when review count changes
    codelensProvider.refresh()
  })

  // 7. CodeLens provider — approve/reject inline in the editor
  const codelensProvider = new ReviewCodeLensProvider()
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'markdown', scheme: 'file' },
      codelensProvider,
    )
  )

  // 8. CodeLens commands — approve, request changes, reject
  context.subscriptions.push(
    vscode.commands.registerCommand('md-feedback.approveMemo', async (uri: vscode.Uri, memoId: string) => {
      await updateMemoStatusInDocument(uri, memoId, 'done')
    }),
    vscode.commands.registerCommand('md-feedback.requestChangesMemo', async (uri: vscode.Uri, memoId: string) => {
      await updateMemoStatusInDocument(uri, memoId, 'open')
    }),
    vscode.commands.registerCommand('md-feedback.rejectMemo', async (uri: vscode.Uri, memoId: string) => {
      const reason = await vscode.window.showInputBox({
        prompt: 'Rejection reason (optional — press Enter to skip, Esc to cancel)',
        placeHolder: 'e.g. "Not applicable to this scope"',
      })
      if (reason === undefined) return // ESC = cancel reject entirely
      await updateMemoStatusInDocument(uri, memoId, 'wontfix', reason || undefined)
    }),
  )

  // 9. Keyboard shortcuts — approve/reject nearest memo
  context.subscriptions.push(
    vscode.commands.registerCommand('md-feedback.approveNearest', () => updateNearestMemo('done')),
    vscode.commands.registerCommand('md-feedback.rejectNearest', async () => {
      const reason = await vscode.window.showInputBox({
        prompt: 'Rejection reason (optional — press Enter to skip, Esc to cancel)',
        placeHolder: 'e.g. "Not applicable to this scope"',
      })
      if (reason === undefined) return // ESC = cancel reject entirely
      await updateNearestMemo('wontfix', reason || undefined)
    }),
  )
  context.subscriptions.push(
    vscode.commands.registerCommand('md-feedback.annotateHighlight', () => addAnnotationFromSelection('highlight', 'yellow')),
    vscode.commands.registerCommand('md-feedback.annotateFix', () => addAnnotationFromSelection('fix', 'red')),
    vscode.commands.registerCommand('md-feedback.annotateQuestion', () => addAnnotationFromSelection('question', 'blue')),
  )

  // 10a. Approve All — bulk approve all needs_review memos
  context.subscriptions.push(
    vscode.commands.registerCommand('md-feedback.approveAll', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor || editor.document.languageId !== 'markdown') {
        void vscode.window.showWarningMessage('Open a markdown file to approve.')
        return
      }
      const count = await approveAllNeedsReview(editor.document.uri)
      if (count > 0) {
        void vscode.window.showInformationMessage(`Approved ${count} annotation${count > 1 ? 's' : ''}.`)
      } else {
        void vscode.window.showInformationMessage('No annotations need review.')
      }
    }),
  )

  // 10. One-time per version notice: extension update does not auto-update npm MCP package
  void (async () => {
    const noticeKey = 'md-feedback.npmUpdateNoticeVersion'
    const lastShownVersion = context.globalState.get<string>(noticeKey)
    if (lastShownVersion === extensionVersion) return
    if (!lastShownVersion) {
      await context.globalState.update(noticeKey, extensionVersion)
      return
    }

    const action = await vscode.window.showInformationMessage(
      `MD Feedback ${extensionVersion} installed. Note: VS Code extension updates do not auto-update the MCP npm package.`,
      'Copy: npm update -g md-feedback',
      'Copy: npx -y md-feedback',
      'Dismiss',
    )

    if (action === 'Copy: npm update -g md-feedback') {
      await vscode.env.clipboard.writeText('npm update -g md-feedback')
      void vscode.window.showInformationMessage('Copied: npm update -g md-feedback')
    } else if (action === 'Copy: npx -y md-feedback') {
      await vscode.env.clipboard.writeText('npx -y md-feedback')
      void vscode.window.showInformationMessage('Copied: npx -y md-feedback')
    }

    await context.globalState.update(noticeKey, extensionVersion)
  })()

  // 11. One-time entry reveal for first-time users
  void (async () => {
    const revealKey = 'md-feedback.sidebarAutoRevealDone'
    if (context.globalState.get<boolean>(revealKey, false)) return
    await vscode.commands.executeCommand('workbench.view.extension.md-feedback')
    await context.globalState.update(revealKey, true)
  })()
}

export function deactivate() { }
