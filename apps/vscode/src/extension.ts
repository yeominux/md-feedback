import * as vscode from 'vscode'
import { MdFeedbackPanelProvider } from './panel-provider'
import { SyncController } from './sync-controller'
import { registerExportCommands } from './export-commands'
import { ReviewCodeLensProvider, updateMemoStatusInDocument, updateNearestMemo } from './review-codelens'

export function activate(context: vscode.ExtensionContext) {
  const extensionVersion = String(context.extension.packageJSON.version ?? '0.0.0')

  // 1. WebviewViewProvider registration
  const panelProvider = new MdFeedbackPanelProvider(context)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('md-feedback.panel', panelProvider)
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
      statusBarItem.text = `$(eye) ${count} need review`
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
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
      await updateMemoStatusInDocument(uri, memoId, 'wontfix')
    }),
  )

  // 9. Keyboard shortcuts — approve/reject nearest memo
  context.subscriptions.push(
    vscode.commands.registerCommand('md-feedback.approveNearest', () => updateNearestMemo('done')),
    vscode.commands.registerCommand('md-feedback.rejectNearest', () => updateNearestMemo('wontfix')),
  )

  // 10. One-time per version notice: extension update does not auto-update npm MCP package
  void (async () => {
    const noticeKey = 'md-feedback.npmUpdateNoticeVersion'
    const lastShownVersion = context.globalState.get<string>(noticeKey)
    if (lastShownVersion === extensionVersion) return

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
}

export function deactivate() {}
