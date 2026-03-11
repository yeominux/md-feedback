import { describe, expect, it, vi } from 'vitest'

vi.mock('vscode', () => {
  class EventEmitter<T> {
    public event = (listener: (value: T) => void) => {
      this.listeners.push(listener)
      return { dispose: () => {} }
    }
    private listeners: Array<(value: T) => void> = []
    fire(value: T): void {
      for (const listener of this.listeners) listener(value)
    }
  }

  return {
    EventEmitter,
    window: {
      showInformationMessage: vi.fn().mockResolvedValue(undefined),
    },
  }
})

vi.mock('./document-sync', () => ({
  getActiveMarkdownDocument: vi.fn(),
  sendDocumentToWebview: vi.fn(),
  sendStatusInfo: vi.fn(),
}))

vi.mock('./exports', () => ({
  autoSaveExport: vi.fn(),
  handleGenericExport: vi.fn(),
}))

vi.mock('./panel-view', () => ({
  resolveWebviewView: vi.fn(),
}))

import { MdFeedbackPanelProvider } from './panel-provider'

describe('MdFeedbackPanelProvider', () => {
  it('postMessage includes current documentUri', async () => {
    const provider = new MdFeedbackPanelProvider({
      extensionUri: {} as unknown,
      globalState: { get: vi.fn(), update: vi.fn() },
      subscriptions: [],
    } as unknown as any)

    const postMessage = vi.fn().mockResolvedValue(undefined)
    ;(provider as any)._view = { webview: { postMessage } }
    ;(provider as any).currentDocument = { uri: { toString: () => 'file:///plan.md' } }

    provider.postMessage({ type: 'ping' })

    expect(postMessage).toHaveBeenCalledWith({ type: 'ping', documentUri: 'file:///plan.md' })
  })

  it('clearWebviewEditMarker resets webview marker state', () => {
    const provider = new MdFeedbackPanelProvider({
      extensionUri: {} as unknown,
      globalState: { get: vi.fn(), update: vi.fn() },
      subscriptions: [],
    } as unknown as any)

    ;(provider as any).editVersion = 3
    ;(provider as any).lastWebviewEditVersion = 3
    expect(provider.isLatestEditFromWebview()).toBe(true)

    provider.clearWebviewEditMarker()
    expect(provider.isLatestEditFromWebview()).toBe(false)
  })
})
