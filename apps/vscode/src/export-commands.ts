import * as vscode from 'vscode'
import { MdFeedbackPanelProvider } from './panel-provider'
import type { TargetFormat } from '@md-feedback/shared'

export function registerExportCommands(context: vscode.ExtensionContext) {
  const resolvePanel = async (): Promise<MdFeedbackPanelProvider | null> => {
    let panel = MdFeedbackPanelProvider.activePanel
    if (panel?.view) return panel
    await vscode.commands.executeCommand('workbench.view.extension.md-feedback')
    panel = MdFeedbackPanelProvider.activePanel
    return panel?.view ? panel : null
  }

  const targets: { command: string; target: TargetFormat }[] = [
    { command: 'md-feedback.exportClaude', target: 'claude-code' },
    { command: 'md-feedback.exportCursor', target: 'cursor' },
    { command: 'md-feedback.exportCodex', target: 'codex' },
    { command: 'md-feedback.exportCopilot', target: 'copilot' },
    { command: 'md-feedback.exportCline', target: 'cline' },
    { command: 'md-feedback.exportWindsurf', target: 'windsurf' },
    { command: 'md-feedback.exportRooCode', target: 'roo-code' },
    { command: 'md-feedback.exportGemini', target: 'gemini' },
    { command: 'md-feedback.exportAntigravity', target: 'antigravity' },
    { command: 'md-feedback.exportGeneric', target: 'generic' },
    { command: 'md-feedback.exportHandoff', target: 'handoff' },
  ]

  for (const { command, target } of targets) {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, async () => {
        const panel = await resolvePanel()
        if (!panel?.view) {
          vscode.window.showErrorMessage('MD Feedback panel not found. Open it from the sidebar.')
          return
        }
        panel.postMessage({ type: 'export.request', target })
      }),
    )
  }

  // Export All — writes all tool-specific context files at once
  context.subscriptions.push(
    vscode.commands.registerCommand('md-feedback.exportAll', async () => {
      const panel = await resolvePanel()
      if (!panel?.view) {
        vscode.window.showErrorMessage('MD Feedback panel not found. Open it from the sidebar.')
        return
      }
      panel.postMessage({ type: 'export.request', target: 'all' })
    }),
  )
}
