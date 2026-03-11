import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vscode', () => {
  class RelativePattern {
    constructor(public base: unknown, public pattern: string) {}
  }

  return {
    RelativePattern,
    Uri: {
      joinPath: (...parts: string[]) => parts.join('/'),
    },
    window: {
      activeTextEditor: undefined,
      onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeTextEditorSelection: vi.fn(() => ({ dispose: vi.fn() })),
      showWarningMessage: vi.fn(),
      showInputBox: vi.fn(),
      showInformationMessage: vi.fn().mockResolvedValue(undefined),
      visibleTextEditors: [],
    },
    workspace: {
      textDocuments: [],
      getConfiguration: vi.fn(() => ({
        get: vi.fn(() => undefined),
      })),
      onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
      asRelativePath: vi.fn(() => 'docs/plan.md'),
      createFileSystemWatcher: vi.fn(() => ({
        onDidChange: vi.fn(),
        dispose: vi.fn(),
      })),
      applyEdit: vi.fn().mockResolvedValue(true),
    },
    WorkspaceEdit: class {
      replace = vi.fn()
      insert = vi.fn()
    },
    Range: class {
      constructor(
        public startLine: number,
        public startCol: number,
        public endLine: number,
        public endCol: number,
      ) {}
    },
    TextEditorRevealType: {
      InCenterIfOutsideViewport: 0,
    },
  }
})

import { SyncController } from './sync-controller'

describe('SyncController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('skips exactly one file watch update after webview-originated edit', () => {
    const panelProvider = {
      isLatestEditFromWebview: vi.fn(() => false),
      clearWebviewEditMarker: vi.fn(),
      handleDocumentUpdate: vi.fn(),
      postMessage: vi.fn(),
      onFirstAnnotationApplied: vi.fn(() => ({ dispose: vi.fn() })),
    }
    const context = { subscriptions: [] as Array<{ dispose?: () => void }> }

    const controller = new SyncController(panelProvider as any, context as any)
    vi.spyOn(controller, 'currentDocument').mockReturnValue({ uri: { toString: () => 'file:///plan.md' } } as any)

    ;(controller as any).skipNextFileWatch = true
    ;(controller as any).handleExternalFileChange()
    vi.advanceTimersByTime(600)

    expect(panelProvider.clearWebviewEditMarker).toHaveBeenCalledTimes(1)
    expect(panelProvider.handleDocumentUpdate).not.toHaveBeenCalled()

    ;(controller as any).handleExternalFileChange()
    vi.advanceTimersByTime(600)

    expect(panelProvider.handleDocumentUpdate).toHaveBeenCalledTimes(1)
    controller.dispose()
  })
})
