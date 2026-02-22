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

## Marketplace Publish Commands

- VS Code Marketplace only: `pnpm publish:vsce`
- Open VSX only: `pnpm publish:ovsx`
- Both in sequence: `pnpm publish:marketplaces`

Required environment tokens:
- `VSCE_PAT` for VS Code Marketplace (`vsce publish`)
- `OVSX_PAT` for Open VSX (`ovsx publish`)

## Private Gate Mode (Recommended)

To keep gate logic and policy fully out of this public repository, CI can call an external private gate endpoint.

Repository secrets:

- `PRIVATE_GATES_ENFORCED` (`true` to enable strict mode)
- `PRIVATE_GATES_ENDPOINT` (example: `https://private-gate.example.com/check`)
- `PRIVATE_GATES_TOKEN` (bearer token used by CI client)
- `GUARD_PATTERNS` (existing public-surface content guard patterns)

Bootstrap helpers:

- Private service template: `scripts/private-gates-service-template.mjs`
- Secret setup helper: `pnpm private-gates:setup -- --repo <owner/repo> --endpoint <url> --token <token> --enforced true`
- Pattern encoder helper: `pnpm policy:encode "<regex1>" "<regex2>"`
