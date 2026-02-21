import { readMarkdownFile, writeMarkdownFile } from './file-ops.js'
import { generateBodyHash, type DocumentParts, isResolved } from '@md-feedback/shared'
import { generateId } from '@md-feedback/shared'
import { createFileSafety, validateFilePath } from './file-safety.js'
import { FileSafetyError, PatchApplyError, serializeToolError } from './errors.js'
import { listWorkspaceDocuments } from './workspace.js'

export type ToolText = { type: 'text'; text: string }
export type ToolResult = { content: ToolText[]; isError?: boolean }
export type ToolErrorResult = { content: ToolText[]; isError: true }

export interface ToolRuntime {
  safeRead: (file: string) => string
  safeWrite: (file: string, content: string) => void
  listDocuments: (options?: { annotatedOnly?: boolean; maxFiles?: number }) => string[]
  wrapTool: <T extends ToolResult>(fn: () => Promise<T>) => Promise<T | ToolErrorResult>
  ensureDefaultGate: (parts: DocumentParts) => void
  updateCursorFromMemos: (parts: DocumentParts, taskId: string, nextAction?: string) => void
  applyUnifiedDiff: (original: string, patch: string, fileLabel: string) => string
}

export type QueryToolContext = Pick<ToolRuntime, 'safeRead' | 'wrapTool' | 'listDocuments'>
export type MutationToolContext = Pick<
  ToolRuntime,
  'safeRead' | 'safeWrite' | 'wrapTool' | 'ensureDefaultGate' | 'updateCursorFromMemos' | 'applyUnifiedDiff'
>

interface ToolRuntimeOptions {
  workspace?: string
  log?: (msg: string) => void
}

export function createToolRuntime(options: ToolRuntimeOptions = {}): ToolRuntime {
  const { workspace, log } = options
  const safety = createFileSafety(workspace)

  function safeRead(file: string): string {
    const check = validateFilePath(safety, file)
    if (!check.safe) throw new FileSafetyError(check.reason!, { file })
    return readMarkdownFile(file)
  }

  function safeWrite(file: string, content: string): void {
    const check = validateFilePath(safety, file)
    if (!check.safe) throw new FileSafetyError(check.reason!, { file })
    writeMarkdownFile(file, content)
  }

  function listDocuments(options?: { annotatedOnly?: boolean; maxFiles?: number }): string[] {
    return listWorkspaceDocuments(safety.workspaceRoot, options)
  }

  function toToolError(err: unknown): ToolErrorResult {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(serializeToolError(err)),
      }],
      isError: true,
    }
  }

  async function wrapTool<T extends ToolResult>(fn: () => Promise<T>): Promise<T | ToolErrorResult> {
    try {
      return await fn()
    } catch (err) {
      if (log) {
        const serialized = serializeToolError(err)
        log(`tool error: ${JSON.stringify(serialized)}`)
      }
      return toToolError(err)
    }
  }

  function ensureDefaultGate(parts: DocumentParts): void {
    if (parts.gates.length === 0 && parts.memos.length > 0) {
      parts.gates.push({
        id: generateId('gate'),
        type: 'merge',
        status: 'blocked',
        blockedBy: [],
        canProceedIf: '',
        doneDefinition: 'All review annotations resolved',
      })
    }
  }

  function updateCursorFromMemos(parts: DocumentParts, taskId: string, nextAction?: string): void {
    const resolvedCount = parts.memos.filter(m => isResolved(m.status)).length
    const appliedCount = parts.memos.filter(m => m.status !== 'open').length
    const openMemos = parts.memos.filter(m => !isResolved(m.status))
    parts.cursor = {
      taskId,
      step: `${appliedCount} applied, ${resolvedCount}/${parts.memos.length} resolved`,
      nextAction: nextAction ?? (
        openMemos.length === 0
          ? 'All annotations resolved — review complete'
          : `Resolve: ${openMemos.map(m => m.id).slice(0, 3).join(', ')}${openMemos.length > 3 ? '...' : ''}`
      ),
      lastSeenHash: generateBodyHash(parts.body),
      updatedAt: new Date().toISOString(),
    }
  }

  function applyUnifiedDiff(original: string, patch: string, fileLabel: string): string {
    const sourceLines = original.split('\n')
    const patchLines = patch.split('\n')
    const output: string[] = []
    let sourceIdx = 0
    let i = 0
    let sawHunk = false

    while (i < patchLines.length) {
      const line = patchLines[i]
      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (!hunkMatch) {
        i++
        continue
      }
      sawHunk = true
      const oldStart = Number(hunkMatch[1])
      const targetSourceIdx = oldStart - 1
      if (targetSourceIdx < sourceIdx || targetSourceIdx > sourceLines.length) {
        throw new PatchApplyError(`Invalid patch hunk range for ${fileLabel}`, { file: fileLabel })
      }

      output.push(...sourceLines.slice(sourceIdx, targetSourceIdx))
      sourceIdx = targetSourceIdx
      i++

      while (i < patchLines.length && !patchLines[i].startsWith('@@ ')) {
        const patchLine = patchLines[i]
        if (patchLine.startsWith('\\ No newline at end of file')) {
          i++
          continue
        }
        const op = patchLine[0]
        const text = patchLine.slice(1)
        if (op === ' ') {
          if (sourceIdx >= sourceLines.length || sourceLines[sourceIdx] !== text) {
            throw new PatchApplyError(`Patch context mismatch in ${fileLabel}`, { file: fileLabel })
          }
          output.push(text)
          sourceIdx++
        } else if (op === '-') {
          if (sourceIdx >= sourceLines.length || sourceLines[sourceIdx] !== text) {
            throw new PatchApplyError(`Patch delete mismatch in ${fileLabel}`, { file: fileLabel })
          }
          sourceIdx++
        } else if (op === '+') {
          output.push(text)
        } else {
          throw new PatchApplyError(`Unsupported patch line in ${fileLabel}: "${patchLine}"`, { file: fileLabel })
        }
        i++
      }
    }

    if (!sawHunk) {
      throw new PatchApplyError(`Invalid unified diff for ${fileLabel}: no hunks found`, { file: fileLabel })
    }

    output.push(...sourceLines.slice(sourceIdx))
    return output.join('\n')
  }

  return {
    safeRead,
    safeWrite,
    listDocuments,
    wrapTool,
    ensureDefaultGate,
    updateCursorFromMemos,
    applyUnifiedDiff,
  }
}
