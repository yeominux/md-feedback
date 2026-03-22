interface VsCodeApi {
  postMessage(msg: unknown): void
  getState(): unknown
  setState(state: unknown): void
}

declare function acquireVsCodeApi(): VsCodeApi

declare global {
  interface Window {
    __MD_FEEDBACK_MODE?: 'http'
    __MD_FEEDBACK_WS_URL?: string
  }
}

// ---------------------------------------------------------------------------
// HTTP/WebSocket transport for standalone (browser) mode
// ---------------------------------------------------------------------------

let _wsInstance: WebSocket | null = null
let _wsReady = false
const _wsPending: unknown[] = []

function getWsUrl(): string {
  if (window.__MD_FEEDBACK_WS_URL) return window.__MD_FEEDBACK_WS_URL
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws`
}

function ensureWs(): WebSocket {
  if (_wsInstance && (_wsInstance.readyState === WebSocket.OPEN || _wsInstance.readyState === WebSocket.CONNECTING)) {
    return _wsInstance
  }
  const ws = new WebSocket(getWsUrl())
  _wsInstance = ws
  _wsReady = false
  ws.addEventListener('open', () => {
    _wsReady = true
    for (const msg of _wsPending) {
      ws.send(JSON.stringify(msg))
    }
    _wsPending.length = 0
  })
  ws.addEventListener('message', (ev) => {
    try {
      const data = JSON.parse(ev.data as string) as unknown
      window.dispatchEvent(new MessageEvent('message', { data }))
    } catch { /* ignore non-JSON */ }
  })
  ws.addEventListener('close', () => {
    _wsReady = false
    _wsInstance = null
    // Reconnect after 2 s
    setTimeout(() => ensureWs(), 2000)
  })
  ws.addEventListener('error', () => {
    // error fires before close; close handler will reconnect
  })
  return ws
}

function httpPostMessage(msg: unknown): void {
  // Route document.edit to REST, everything else over WebSocket
  if (msg && typeof msg === 'object' && (msg as Record<string, unknown>).type === 'document.edit') {
    const m = msg as Record<string, unknown>
    const filePath = (window as unknown as Record<string, unknown>).__MD_FEEDBACK_FILE as string | undefined
    if (filePath) {
      fetch(`/api/files/${encodeURIComponent(filePath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: m.content }),
      }).catch(() => { /* best-effort */ })
      return
    }
  }

  // Send over WebSocket
  const ws = ensureWs()
  if (_wsReady) {
    ws.send(JSON.stringify(msg))
  } else {
    _wsPending.push(msg)
  }
}

// ---------------------------------------------------------------------------
// Unified api object
// ---------------------------------------------------------------------------

const isHttpMode = (): boolean =>
  typeof window !== 'undefined' && window.__MD_FEEDBACK_MODE === 'http'

// In VS Code webview, acquireVsCodeApi is injected by the host.
// In standalone (HTTP) mode, use fetch + WebSocket.
// In dev mode (Vite), create a console mock.
function buildApi(): VsCodeApi {
  if (typeof acquireVsCodeApi !== 'undefined') {
    return acquireVsCodeApi()
  }
  if (isHttpMode()) {
    // Initialize WebSocket eagerly
    if (typeof WebSocket !== 'undefined') ensureWs()
    return {
      postMessage: httpPostMessage,
      getState: () => undefined,
      setState: () => {},
    }
  }
  // Vite dev mock
  return {
    postMessage: (msg: unknown) => console.log('[vscode mock] postMessage:', msg),
    getState: () => undefined,
    setState: () => {},
  }
}

export const vscode = buildApi()
