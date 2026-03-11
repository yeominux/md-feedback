import * as vscode from 'vscode'
import { generateContext, TARGET_LABELS, type TargetFormat } from '@md-feedback/shared'
import type { ReviewHighlight, ReviewMemo } from '@md-feedback/shared'

export function wrapWithPrompt(content: string, documentUri: vscode.Uri): string {
  const relativePath = vscode.workspace.asRelativePath(documentUri)
  return `I reviewed ${relativePath} and annotated it with MD Feedback. Here are the changes and questions. Implement the fixes and answer the questions:\n\n${content}`
}

export interface AutoSaveExportOptions {
  document: vscode.TextDocument
  target: TargetFormat
  content: string
  silent?: boolean
  postMessage: (msg: Record<string, unknown>) => void
}

export async function autoSaveExport({ document, target, content, silent = false, postMessage }: AutoSaveExportOptions): Promise<boolean> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
  const targetFile = TARGET_LABELS[target]?.file

  if (workspaceFolder && targetFile && targetFile !== '(clipboard + file)') {
    try {
      const uri = vscode.Uri.joinPath(workspaceFolder.uri, targetFile)
      // Ensure parent directories exist (for .cursor/rules/, .github/, .roo/rules/, .gemini/)
      const parentDir = vscode.Uri.joinPath(uri, '..')
      try { await vscode.workspace.fs.createDirectory(parentDir) } catch { /* exists */ }

      // Check if file already exists — protect user content
      let fileExists = false
      try {
        await vscode.workspace.fs.stat(uri)
        fileExists = true
      } catch { /* not found */ }

      if (fileExists && silent) {
        // Export All: skip existing files to avoid overwriting user content
        return false
      }

      if (fileExists) {
        const choice = await vscode.window.showWarningMessage(
          `${targetFile} already exists. How to proceed?`,
          'Overwrite', 'Append', 'Cancel',
        )
        if (choice === 'Cancel' || !choice) return false
        if (choice === 'Append') {
          const existing = await vscode.workspace.fs.readFile(uri)
          content = Buffer.from(existing).toString('utf-8') + '\n\n---\n\n' + content
        }
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'))
      if (!silent) {
        try {
          const wrapped = wrapWithPrompt(content, document.uri)
          await vscode.env.clipboard.writeText(wrapped)
          vscode.window.showInformationMessage(`Saved: ${targetFile} + copied to clipboard`)
          postMessage({ type: 'export.saved', message: `Saved: ${targetFile} + copied to clipboard` })
        } catch {
          vscode.window.showInformationMessage(`Saved: ${targetFile}`)
          postMessage({ type: 'export.saved', message: `Saved: ${targetFile}` })
        }
      }
      return true
    } catch (error) {
      if (!silent) {
        vscode.window.showErrorMessage(`Failed to save ${targetFile}: ${error instanceof Error ? error.message : String(error)}`)
      }
      return false
    }
  }

  // Fallback: save dialog
  if (!silent) {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(targetFile || 'review-context.md'),
      filters: { 'Markdown': ['md', 'mdc'] },
    })
    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'))
      const savedName = vscode.workspace.asRelativePath(uri)
      try {
        const wrapped = wrapWithPrompt(content, document.uri)
        await vscode.env.clipboard.writeText(wrapped)
        vscode.window.showInformationMessage(`Saved to ${savedName} + copied to clipboard`)
        postMessage({ type: 'export.saved', message: `Saved: ${savedName} + copied to clipboard` })
      } catch {
        vscode.window.showInformationMessage(`Saved to ${savedName}`)
        postMessage({ type: 'export.saved', message: `Saved: ${savedName}` })
      }
      return true
    }
  }
  return false
}

export interface HandleGenericExportOptions {
  msg: Record<string, unknown>
  document: vscode.TextDocument | undefined
  postMessage: (msg: Record<string, unknown>) => void
}

export async function handleGenericExport({ msg, document, postMessage }: HandleGenericExportOptions): Promise<void> {
  if (!document) {
    vscode.window.showWarningMessage('Open a markdown file to review.')
    return
  }

  const title = typeof msg.title === 'string' ? msg.title : ''
  const filePath = typeof msg.filePath === 'string' ? msg.filePath : vscode.workspace.asRelativePath(document.uri)
  const sections = Array.isArray(msg.sections) ? msg.sections.filter(s => typeof s === 'string') : []
  const highlights = Array.isArray(msg.highlights) ? msg.highlights as ReviewHighlight[] : []
  const docMemos = Array.isArray(msg.docMemos) ? msg.docMemos as ReviewMemo[] : []

  const content = typeof msg.content === 'string'
    ? msg.content
    : generateContext(title, filePath, sections, highlights, docMemos, 'generic' as TargetFormat)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `generic-review-${timestamp}.md`
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
  let fileSaved = false
  let clipboardSaved = false
  let lastError: unknown

  if (workspaceFolder) {
    try {
      // #26: Save generic exports in .md-feedback/ subdirectory to avoid workspace root pollution
      const subDir = vscode.Uri.joinPath(workspaceFolder.uri, '.md-feedback')
      try { await vscode.workspace.fs.createDirectory(subDir) } catch { /* exists */ }
      const uri = vscode.Uri.joinPath(subDir, filename)
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'))
      fileSaved = true
    } catch (error) {
      lastError = error
    }
  }

  try {
    const wrapped = wrapWithPrompt(content, document.uri)
    await vscode.env.clipboard.writeText(wrapped)
    clipboardSaved = true
  } catch (error) {
    lastError = error
  }

  if (workspaceFolder && fileSaved && clipboardSaved) {
    const message = `.md-feedback/${filename} saved + clipboard copied`
    vscode.window.showInformationMessage(message)
    postMessage({ type: 'export.saved', message })
    return
  }

  if (workspaceFolder && fileSaved && !clipboardSaved) {
    const message = `.md-feedback/${filename} saved (clipboard copy failed)`
    vscode.window.showInformationMessage(message)
    postMessage({ type: 'export.saved', message })
    return
  }

  if (!workspaceFolder && clipboardSaved) {
    const message = 'Clipboard copied (no workspace for file save)'
    vscode.window.showInformationMessage(message)
    postMessage({ type: 'export.saved', message })
    return
  }

  const errMsg = lastError instanceof Error ? lastError.message : String(lastError || 'Unknown error')
  vscode.window.showErrorMessage(`Export failed: ${errMsg}`)
}
