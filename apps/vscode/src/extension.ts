import * as vscode from 'vscode'
import { MdFeedbackPanelProvider } from './panel-provider'
import { SyncController } from './sync-controller'
import { registerExportCommands } from './export-commands'

export function activate(context: vscode.ExtensionContext) {
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
}

export function deactivate() {}
