# Publishing Guide

## Public Packages

| Channel | Package Name | Registry |
|---------|-------------|----------|
| npm | md-feedback | https://www.npmjs.com/package/md-feedback |
| VS Code Marketplace | md-feedback-vscode | https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode |
| GitHub | yeominux/md-feedback | https://github.com/yeominux/md-feedback |

## Private Packages (not published)

| Package | Purpose |
|---------|---------|
| md-feedback-monorepo (root) | Workspace root, `private: true` |
| @md-feedback/shared | Internal shared types/utilities, `private: true` |

## npm Package Contents (md-feedback)

Controlled by `apps/mcp-server/package.json` `"files"` field:

- `dist/mcp-server.js` — Bundled MCP server
- `bin/md-feedback.cjs` — CLI entry point
- `README.md` — Package documentation
- `LICENSE` — SUL-1.0 license text
- `package.json` — Auto-included by npm

Verify with: `cd apps/mcp-server && npm pack --dry-run`

## VS Code Extension Contents (md-feedback-vscode)

Controlled by `apps/vscode/.vscodeignore`:

- `dist/` — Bundled extension and webview
- `icon.png` — Extension icon
- `LICENSE` — SUL-1.0 license text
- `README.md` — Marketplace page
- `CHANGELOG.md` — Marketplace changelog tab
- `package.json` — Extension manifest
