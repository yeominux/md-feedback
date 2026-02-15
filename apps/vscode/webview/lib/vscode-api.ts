interface VsCodeApi {
  postMessage(msg: unknown): void
  getState(): unknown
  setState(state: unknown): void
}

declare function acquireVsCodeApi(): VsCodeApi

// In VS Code webview, acquireVsCodeApi is injected by the host.
// In dev mode (Vite), create a console mock.
const api: VsCodeApi = typeof acquireVsCodeApi !== 'undefined'
  ? acquireVsCodeApi()
  : {
      postMessage: (msg: unknown) => console.log('[vscode mock] postMessage:', msg),
      getState: () => undefined,
      setState: () => {},
    }

export const vscode = api
