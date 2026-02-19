import * as vscode from 'vscode'
import { createCheckpoint } from '@md-feedback/shared'
import { buildHandoffDocument, formatHandoffMarkdown } from '@md-feedback/shared'
import { generateContext, TARGET_LABELS, type TargetFormat } from '@md-feedback/shared'
import { serializeGate, serializeCheckpoint, serializeCursor, serializeMemoImpl, serializeMemoArtifact, serializeMemoDependency, splitDocument, mergeDocument, evaluateAllGates } from '@md-feedback/shared'
import { extractCheckpoints } from '@md-feedback/shared'
import type { ReviewHighlight, ReviewMemo, Gate, Checkpoint, PlanCursor, MemoImpl, MemoArtifact, MemoDependency } from '@md-feedback/shared'
import { getHtml } from './webview-html'
import { wrapWithPrompt } from './exports'
import { advanceWorkflowPhase, approveCheckpoint, getWorkflowState } from './workflow-sidecar'

export interface PanelViewContext {
  extensionUri: vscode.Uri
  setActivePanel: () => void
  clearActivePanel: () => void
  postMessage: (msg: Record<string, unknown>) => void
  getCurrentDocument: () => vscode.TextDocument | undefined
  setCurrentDocument: (document: vscode.TextDocument | undefined) => void
  getEditVersion: () => number
  incrementEditVersion: () => number
  getLastWebviewEditVersion: () => number
  setLastWebviewEditVersion: (value: number) => void
  getPreservedFrontmatter: () => string
  getPreservedGates: () => Gate[]
  getPreservedCheckpoints: () => Checkpoint[]
  getPreservedCursor: () => PlanCursor | null
  getPreservedImpls: () => MemoImpl[]
  getPreservedArtifacts: () => MemoArtifact[]
  getPreservedDependencies: () => MemoDependency[]
  sendDocumentToWebview: (document: vscode.TextDocument) => void
  getActiveMarkdownDocument: () => vscode.TextDocument | undefined
  autoSaveExport: (document: vscode.TextDocument, target: TargetFormat, content: string, silent?: boolean) => Promise<boolean>
  handleGenericExport: (msg: Record<string, unknown>) => Promise<void>
  sendStatusInfo: (raw: string) => void
  getOnboardingDone: () => boolean
  setOnboardingDone: (value: boolean) => Thenable<void>
  getMcpSetupDone: () => boolean
  setMcpSetupDone: (value: boolean) => Thenable<void>
  fireFirstAnnotationApplied: () => void
}

export function resolveWebviewView(webviewView: vscode.WebviewView, ctx: PanelViewContext): void {
  ctx.setActivePanel()

  const distUri = vscode.Uri.joinPath(ctx.extensionUri, 'dist', 'webview')
  webviewView.webview.options = {
    enableScripts: true,
    localResourceRoots: [distUri],
  }

  webviewView.webview.html = getHtml(webviewView.webview, ctx.extensionUri)

  const disposables: vscode.Disposable[] = []

  /** Resolve the effective theme: 'auto' → detect from VS Code, otherwise use explicit value */
  function resolveTheme(): 'light' | 'dark' {
    const setting = vscode.workspace.getConfiguration('md-feedback').get<string>('theme', 'auto')
    if (setting === 'light' || setting === 'dark') return setting
    // Auto-detect from VS Code color theme
    const kind = vscode.window.activeColorTheme.kind
    return (kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast)
      ? 'dark' : 'light'
  }

  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('md-feedback.theme')) {
      ctx.postMessage({ type: 'theme.update', theme: resolveTheme() })
    }
  })
  disposables.push(configListener)

  // Listen for VS Code color theme changes (auto mode)
  const colorThemeListener = vscode.window.onDidChangeActiveColorTheme(() => {
    const setting = vscode.workspace.getConfiguration('md-feedback').get<string>('theme', 'auto')
    if (setting === 'auto') {
      ctx.postMessage({ type: 'theme.update', theme: resolveTheme() })
    }
  })
  disposables.push(colorThemeListener)

  const messageHandler = webviewView.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.type) {
      case 'webview.ready': {
        const document = ctx.getActiveMarkdownDocument()
        if (document) {
          ctx.setCurrentDocument(document)
          ctx.sendDocumentToWebview(document)
          const onboardingDone = ctx.getOnboardingDone()
          ctx.postMessage({ type: 'onboarding.state', done: onboardingDone })
          ctx.postMessage({ type: 'mcp.state', done: ctx.getMcpSetupDone() })

          ctx.postMessage({ type: 'theme.update', theme: resolveTheme() })
        } else {
          // No markdown file open — webview shows inline placeholder, no toast needed
          ctx.postMessage({ type: 'document.empty' })
        }
        break
      }

      case 'document.edit': {
        const document = ctx.getCurrentDocument() ?? ctx.getActiveMarkdownDocument()
        if (!document) {
          vscode.window.showWarningMessage('Open a markdown file to review.')
          break
        }
        ctx.setCurrentDocument(document)

        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === document.uri.toString())
        const selection = editor?.selection
        const visibleRange = editor?.visibleRanges[0]

        const myVersion = ctx.incrementEditVersion()
        ctx.setLastWebviewEditVersion(myVersion)

        // Restore preserved metadata around webview content
        let fullContent = msg.content || ''

        // Frontmatter restoration
        const preservedFrontmatter = ctx.getPreservedFrontmatter()
        if (preservedFrontmatter) {
          fullContent = preservedFrontmatter.trimEnd() + '\n\n' + fullContent
        }

        // Impls, Artifacts, Dependencies, Gates, Checkpoints, Cursor restoration (append at end)
        const metadataSections: string[] = []
        for (const impl of ctx.getPreservedImpls()) {
          metadataSections.push(serializeMemoImpl(impl))
        }
        for (const art of ctx.getPreservedArtifacts()) {
          metadataSections.push(serializeMemoArtifact(art))
        }
        for (const dep of ctx.getPreservedDependencies()) {
          metadataSections.push(serializeMemoDependency(dep))
        }
        for (const gate of ctx.getPreservedGates()) {
          metadataSections.push(serializeGate(gate))
        }
        for (const cp of ctx.getPreservedCheckpoints()) {
          metadataSections.push(serializeCheckpoint(cp))
        }
        const preservedCursor = ctx.getPreservedCursor()
        if (preservedCursor) {
          metadataSections.push(serializeCursor(preservedCursor))
        }
        if (metadataSections.length > 0) {
          fullContent = fullContent.trimEnd() + '\n\n' + metadataSections.join('\n\n') + '\n'
        }

        const edit = new vscode.WorkspaceEdit()
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          fullContent,
        )

        try {
          const success = await vscode.workspace.applyEdit(edit)
          if (!success) {
            vscode.window.showErrorMessage('Failed to apply edits from MD Feedback.')
          } else {
            // #15: Auto-save to keep disk in sync with VS Code buffer (MCP reads from disk)
            try { await document.save() } catch { /* best-effort */ }

            // Fire first-annotation event AFTER the edit is applied and saved,
            // so sync-controller reads the up-to-date document content for the checkpoint.
            if (msg.firstAnnotation) {
              // Dismiss onboarding
              if (!ctx.getOnboardingDone()) {
                await ctx.setOnboardingDone(true)
                ctx.postMessage({ type: 'onboarding.state', done: true })
              }
              ctx.fireFirstAnnotationApplied()
            }
          }
        } catch (error) {
          vscode.window.showErrorMessage('Failed to apply edits from MD Feedback.')
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
        break
      }

      case 'workflow.advance': {
        const document = ctx.getCurrentDocument() ?? ctx.getActiveMarkdownDocument()
        if (!document) {
          vscode.window.showWarningMessage('Open a markdown file to review.')
          break
        }
        const toPhase = msg.toPhase as 'root_cause' | 'implementation' | 'verification' | undefined
        const current = getWorkflowState(document.uri.fsPath)
        const computedNext = current.phase === 'scope'
          ? 'root_cause'
          : current.phase === 'root_cause'
            ? 'implementation'
            : current.phase === 'implementation'
              ? 'verification'
              : null
        const next = toPhase || computedNext
        if (!next) break

        try {
          advanceWorkflowPhase(document.uri.fsPath, next, 'vscode.workflow.advance', 'Triggered from status CTA')
          ctx.sendStatusInfo(document.getText())
          vscode.window.showInformationMessage(`Workflow advanced to ${next}`)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          vscode.window.showWarningMessage(message)
        }
        break
      }

      case 'workflow.approve': {
        const document = ctx.getCurrentDocument() ?? ctx.getActiveMarkdownDocument()
        if (!document) {
          vscode.window.showWarningMessage('Open a markdown file to review.')
          break
        }
        const state = getWorkflowState(document.uri.fsPath)
        const pendingTool = state.pendingCheckpoint?.tool
        const requestedTool = typeof msg.tool === 'string' ? msg.tool : undefined
        const tool = requestedTool || pendingTool
        const approvedBy = typeof msg.approvedBy === 'string' && msg.approvedBy.trim().length > 0
          ? msg.approvedBy.trim()
          : 'vscode-user'
        const reason = typeof msg.reason === 'string' && msg.reason.trim().length > 0
          ? msg.reason.trim()
          : `Approved ${tool ?? 'checkpoint'} via VS Code status CTA`
        if (!tool) {
          vscode.window.showWarningMessage('No pending approval checkpoint.')
          break
        }

        try {
          approveCheckpoint(
            document.uri.fsPath,
            tool,
            approvedBy,
            reason,
          )
          ctx.sendStatusInfo(document.getText())
          vscode.window.showInformationMessage(`Approved checkpoint for ${tool} by ${approvedBy}`)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          vscode.window.showWarningMessage(message)
        }
        break
      }

      case 'clipboard.copy': {
        await vscode.env.clipboard.writeText(msg.text || '')
        vscode.window.showInformationMessage('Copied to clipboard!')
        break
      }

      case 'checkpoint.create': {
        const document = ctx.getCurrentDocument() ?? ctx.getActiveMarkdownDocument()
        if (!document) {
          vscode.window.showWarningMessage('Open a markdown file to review.')
          break
        }
        ctx.setCurrentDocument(document)

        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === document.uri.toString())
        const selection = editor?.selection
        const visibleRange = editor?.visibleRanges[0]

        const raw = document.getText()
        const { checkpoint, updatedMarkdown } = createCheckpoint(raw, msg.note || '')

        const myVersion = ctx.incrementEditVersion()
        ctx.setLastWebviewEditVersion(myVersion)

        const cpEdit = new vscode.WorkspaceEdit()
        cpEdit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          updatedMarkdown,
        )

        try {
          const success = await vscode.workspace.applyEdit(cpEdit)
          if (!success) {
            vscode.window.showErrorMessage('Failed to create checkpoint.')
            break
          }
        } catch (error) {
          vscode.window.showErrorMessage('Failed to create checkpoint.')
          break
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

        ctx.postMessage({
          type: 'checkpoint.created',
          checkpoint,
          checkpoints: extractCheckpoints(updatedMarkdown),
        })
        vscode.window.showInformationMessage(`Checkpoint created: ${checkpoint.note || checkpoint.id}`)
        break
      }

      case 'checkpoint.list': {
        const document = ctx.getCurrentDocument() ?? ctx.getActiveMarkdownDocument()
        if (!document) break
        const checkpoints = extractCheckpoints(document.getText())
        ctx.postMessage({ type: 'checkpoint.list', checkpoints })
        break
      }

      case 'handoff.generate': {
        const document = ctx.getCurrentDocument() ?? ctx.getActiveMarkdownDocument()
        if (!document) {
          vscode.window.showWarningMessage('Open a markdown file to review.')
          break
        }
        const raw = document.getText()
        const fp = vscode.workspace.asRelativePath(document.uri)
        const doc = buildHandoffDocument(raw, fp)
        const target = msg.target || 'standalone'
        const handoff = formatHandoffMarkdown(doc, target)
        ctx.postMessage({ type: 'handoff.result', handoff })
        break
      }

      case 'export.generic': {
        await ctx.handleGenericExport(msg)
        break
      }

      case 'export.context.generate': {
        const document2 = ctx.getCurrentDocument() ?? ctx.getActiveMarkdownDocument()
        if (!document2) {
          vscode.window.showWarningMessage('Open a markdown file to review.')
          break
        }
        const target2 = msg.target as TargetFormat
        const title2 = typeof msg.title === 'string' ? msg.title : ''
        const filePath2 = typeof msg.filePath === 'string' ? msg.filePath : vscode.workspace.asRelativePath(document2.uri)
        const sections2 = Array.isArray(msg.sections) ? msg.sections.filter((s: unknown) => typeof s === 'string') : []
        const highlights2 = Array.isArray(msg.highlights) ? msg.highlights as ReviewHighlight[] : []
        const docMemos2 = Array.isArray(msg.docMemos) ? msg.docMemos as ReviewMemo[] : []

        const content2 = generateContext(title2, filePath2, sections2, highlights2, docMemos2, target2)
        await ctx.autoSaveExport(document2, target2, content2)
        break
      }

      case 'export.all': {
        const document3 = ctx.getCurrentDocument() ?? ctx.getActiveMarkdownDocument()
        if (!document3) {
          vscode.window.showWarningMessage('Open a markdown file to review.')
          break
        }
        const title3 = typeof msg.title === 'string' ? msg.title : ''
        const filePath3 = typeof msg.filePath === 'string' ? msg.filePath : vscode.workspace.asRelativePath(document3.uri)
        const sections3 = Array.isArray(msg.sections) ? msg.sections.filter((s: unknown) => typeof s === 'string') : []
        const highlights3 = Array.isArray(msg.highlights) ? msg.highlights as ReviewHighlight[] : []
        const docMemos3 = Array.isArray(msg.docMemos) ? msg.docMemos as ReviewMemo[] : []

        const allTargets: TargetFormat[] = ['claude-code', 'cursor', 'codex', 'copilot', 'cline', 'windsurf', 'roo-code', 'gemini', 'antigravity']
        const saved: string[] = []
        let skipped = 0

        for (const t of allTargets) {
          const content3 = generateContext(title3, filePath3, sections3, highlights3, docMemos3, t)
          const ok = await ctx.autoSaveExport(document3, t, content3, true)
          if (ok) saved.push(TARGET_LABELS[t].file)
          else skipped++
        }

        if (saved.length > 0 || skipped > 0) {
          const skippedMsg = skipped > 0 ? ` (${skipped} skipped — already exist)` : ''
          const message = `Exported ${saved.length}/${allTargets.length} files${skippedMsg}`
          vscode.window.showInformationMessage(message)
          ctx.postMessage({ type: 'export.saved', message })
        }
        break
      }

      case 'export.context': {
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(msg.suggestedPath || 'review-context.md'),
          filters: { 'Markdown': ['md', 'mdc'] },
        })
        if (uri) {
          await vscode.workspace.fs.writeFile(uri, Buffer.from(msg.content || '', 'utf-8'))
          const savedName = vscode.workspace.asRelativePath(uri)
          vscode.window.showInformationMessage(`Saved to ${savedName}`)
          ctx.postMessage({ type: 'export.saved', message: `Saved: ${savedName}` })
        }
        break
      }

      case 'export.pickTarget': {
        const document4 = ctx.getCurrentDocument() ?? ctx.getActiveMarkdownDocument()
        if (!document4) {
          vscode.window.showWarningMessage('Open a markdown file to review.')
          break
        }

        // Capture editor data sent from webview
        const pickTitle = typeof msg.title === 'string' ? msg.title : ''
        const pickFilePath = typeof msg.filePath === 'string' ? msg.filePath : vscode.workspace.asRelativePath(document4.uri)
        const pickSections = Array.isArray(msg.sections) ? msg.sections.filter((s: unknown) => typeof s === 'string') : []
        const pickHighlights = Array.isArray(msg.highlights) ? msg.highlights as ReviewHighlight[] : []
        const pickMemos = Array.isArray(msg.docMemos) ? msg.docMemos as ReviewMemo[] : []

        type PickItem = vscode.QuickPickItem & { target?: string }
        const pickItems: PickItem[] = [
          { label: '$(checklist) Export All', description: 'Write all context files at once (Recommended)', target: 'all' },
          { label: '', kind: vscode.QuickPickItemKind.Separator, description: 'Pick one tool' },
          { label: 'Claude Code', description: 'CLAUDE.md', target: 'claude-code' },
          { label: 'Cursor', description: '.cursor/rules/', target: 'cursor' },
          { label: 'GitHub Copilot', description: '.github/', target: 'copilot' },
          { label: 'Windsurf', description: '.windsurfrules', target: 'windsurf' },
          { label: 'Cline', description: '.clinerules', target: 'cline' },
          { label: 'Codex / Gemini / Roo / Antigravity', description: 'Use "Export All" above', target: 'all-others' },
          { label: '', kind: vscode.QuickPickItemKind.Separator },
          { label: 'Generic Markdown', description: 'Clipboard + file (any tool)', target: 'generic' },
          { label: 'Handoff Document', description: 'Session handoff for next agent', target: 'handoff' },
        ]

        const picked = await vscode.window.showQuickPick(pickItems, {
          placeHolder: 'Select export target (or Export All)',
          title: 'MD Feedback — Export',
        })

        if (!picked?.target) break

        if (picked.target === 'all' || picked.target === 'all-others') {
          const allTargets: TargetFormat[] = ['claude-code', 'cursor', 'codex', 'copilot', 'cline', 'windsurf', 'roo-code', 'gemini', 'antigravity']
          const saved: string[] = []
          let skipped = 0
          for (const t of allTargets) {
            const c = generateContext(pickTitle, pickFilePath, pickSections, pickHighlights, pickMemos, t)
            const ok = await ctx.autoSaveExport(document4, t, c, true)
            if (ok) saved.push(TARGET_LABELS[t].file)
            else skipped++
          }
          if (saved.length > 0 || skipped > 0) {
            const skippedMsg = skipped > 0 ? ` (${skipped} skipped — already exist)` : ''
            const message = `Exported ${saved.length}/${allTargets.length} files${skippedMsg}`
            vscode.window.showInformationMessage(message)
            ctx.postMessage({ type: 'export.saved', message })
          }
        } else if (picked.target === 'generic') {
          const c = generateContext(pickTitle, pickFilePath, pickSections, pickHighlights, pickMemos, 'generic')
          await ctx.handleGenericExport({ title: pickTitle, filePath: pickFilePath, sections: pickSections, highlights: pickHighlights, docMemos: pickMemos, content: c })
        } else if (picked.target === 'handoff') {
          const raw = document4.getText()
          const fp = vscode.workspace.asRelativePath(document4.uri)
          const doc = buildHandoffDocument(raw, fp)
          const handoff = formatHandoffMarkdown(doc, 'standalone')
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('HANDOFF.md'),
            filters: { 'Markdown': ['md'] },
          })
          if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(handoff, 'utf-8'))
            const savedName = vscode.workspace.asRelativePath(uri)
            try {
              const wrapped = wrapWithPrompt(handoff, document4.uri)
              await vscode.env.clipboard.writeText(wrapped)
              vscode.window.showInformationMessage(`Saved to ${savedName} + copied to clipboard`)
              ctx.postMessage({ type: 'export.saved', message: `Saved: ${savedName} + copied to clipboard` })
            } catch {
              vscode.window.showInformationMessage(`Saved to ${savedName}`)
              ctx.postMessage({ type: 'export.saved', message: `Saved: ${savedName}` })
            }
          }
        } else {
          const t = picked.target as TargetFormat
          const c = generateContext(pickTitle, pickFilePath, pickSections, pickHighlights, pickMemos, t)
          await ctx.autoSaveExport(document4, t, c)
        }
        break
      }

      case 'gate.override': {
        const document = ctx.getCurrentDocument() ?? ctx.getActiveMarkdownDocument()
        if (!document) break

        const raw = document.getText()
        const parts = splitDocument(raw)
        const gate = parts.gates.find(g => g.id === msg.gateId)
        if (!gate) break

        gate.override = msg.override || null
        // Re-evaluate gates (override will take precedence in evaluateAllGates)
        parts.gates = evaluateAllGates(parts.gates, parts.memos)

        const updated = mergeDocument(parts)
        const myVersion = ctx.incrementEditVersion()
        ctx.setLastWebviewEditVersion(myVersion)

        const edit = new vscode.WorkspaceEdit()
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          updated,
        )
        await vscode.workspace.applyEdit(edit)
        try { await document.save() } catch { /* best-effort */ }
        break
      }

      case 'onboarding.dismiss': {
        await ctx.setOnboardingDone(true)
        break
      }

      case 'mcp.complete': {
        await ctx.setMcpSetupDone(true)
        break
      }

      // annotation.first is now handled as a flag on document.edit (see above).
      // Keep this handler for backwards compatibility with older webview versions.
      case 'annotation.first': {
        const done = ctx.getOnboardingDone()
        if (!done) {
          await ctx.setOnboardingDone(true)
          ctx.postMessage({ type: 'onboarding.state', done: true })
        }
        break
      }
    }
  })
  disposables.push(messageHandler)

  // Resync document when panel becomes visible again (prevents stale state after toggle)
  const visibilityHandler = webviewView.onDidChangeVisibility(() => {
    if (webviewView.visible) {
      const document = ctx.getCurrentDocument() ?? ctx.getActiveMarkdownDocument()
      if (document) {
        ctx.setCurrentDocument(document)
        ctx.sendDocumentToWebview(document)
      }
    }
  })
  disposables.push(visibilityHandler)

  const disposeHandler = webviewView.onDidDispose(() => {
    ctx.clearActivePanel()
    while (disposables.length) {
      const item = disposables.pop()
      if (item) item.dispose()
    }
  })
  disposables.push(disposeHandler)
}
