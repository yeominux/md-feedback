import * as vscode from 'vscode'

export function getHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const distUri = vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'main.js'))
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'style.css'))
  const nonce = getNonce()

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>MD Feedback</title>
</head>
<body style="margin:0;padding:0">
  <script nonce="${nonce}">document.documentElement.dataset.theme=document.body.classList.contains('vscode-dark')||document.body.classList.contains('vscode-high-contrast')?'dark':'light'</script>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
}

export function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let nonce = ''
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return nonce
}
