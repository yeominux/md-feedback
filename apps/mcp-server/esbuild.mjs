import * as esbuild from 'esbuild'
import { readFileSync, cpSync, mkdirSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const sharedEntry = path.resolve(__dirname, '../../packages/shared/src/index.ts')

// pnpm hoists dependencies into root node_modules/.pnpm/node_modules.
// Tell esbuild to search there so bundled deps like 'ws' and 'open' resolve.
const pnpmNodeModules = path.resolve(__dirname, '../../node_modules/.pnpm/node_modules')
const rootNodeModules = path.resolve(__dirname, '../../node_modules')
const vscodeAppDir = path.resolve(__dirname, '../vscode')
const webviewOutDir = path.resolve(__dirname, 'dist/webview')

// ------------------------------------------------------------------
// 1. Build the standalone webview (React app with HTTP transport)
// ------------------------------------------------------------------
console.log('[build] Building standalone webview...')
try {
  execSync('node_modules/.bin/vite build --config vite.standalone.config.ts', {
    cwd: vscodeAppDir,
    stdio: 'inherit',
  })
  console.log('[build] Standalone webview built to dist/webview/')
} catch (err) {
  // Non-fatal: if webview build fails the MCP server still works without UI
  console.warn('[build] WARNING: standalone webview build failed — HTTP server will have no UI assets:', err.message)
  // Ensure the directory exists so http-server.ts doesn't crash on missing staticDir
  mkdirSync(webviewOutDir, { recursive: true })
}

// ------------------------------------------------------------------
// 2. Bundle the MCP server (Node.js CJS bundle)
// ------------------------------------------------------------------
console.log('[build] Bundling MCP server...')
await esbuild.build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  outfile: 'dist/mcp-server.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  banner: { js: '#!/usr/bin/env node' },
  external: ['ws', 'open'],
  nodePaths: [pnpmNodeModules, rootNodeModules],
  alias: {
    '@md-feedback/shared': sharedEntry,
  },
  sourcemap: false,
  minify: true,
  define: {
    '__VERSION__': JSON.stringify(pkg.version),
    // Embed the path to the webview directory relative to the bundle.
    // At runtime __dirname (CJS) points to the dist/ folder, so
    // dist/webview is always next to dist/mcp-server.js.
    '__WEBVIEW_DIR__': JSON.stringify('./webview'),
  },
})
console.log('[build] MCP server bundle written to dist/mcp-server.js')
