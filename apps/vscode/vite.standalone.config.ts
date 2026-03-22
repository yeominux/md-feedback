/**
 * Standalone build config for the MCP server web UI.
 * Output goes to apps/mcp-server/dist/webview/ so it can be served
 * by the HTTP server bundled inside npx md-feedback.
 *
 * Key difference from the VS Code webview build:
 *   - Injects window.__MD_FEEDBACK_MODE = 'http' so vscode-api.ts switches
 *     to the fetch + WebSocket transport instead of acquireVsCodeApi().
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import type { Plugin } from 'vite'

// Re-use the Windows pnpm resolve plugin from vite.config.ts
function pnpmResolve(): Plugin {
  const isWindows = process.platform === 'win32'
  const fallbackSearchPaths = [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, '../../node_modules/.pnpm/node_modules'),
    path.resolve(__dirname, '../../node_modules'),
  ]
  function resolveConditionalExport(pkgDir: string, entry: unknown): string | null {
    if (typeof entry === 'string') return path.resolve(pkgDir, entry)
    if (!entry || typeof entry !== 'object') return null
    const conditions = ['browser', 'import', 'default', 'module', 'node', 'require']
    for (const condition of conditions) {
      const target = resolveConditionalExport(pkgDir, (entry as Record<string, unknown>)[condition])
      if (target) return target
    }
    return null
  }
  function resolveExportTarget(pkgDir: string, pkgExports: unknown, subpath: string): string | null {
    if (!pkgExports) return null
    if (typeof pkgExports === 'string') return subpath === '.' ? path.resolve(pkgDir, pkgExports) : null
    if (typeof pkgExports !== 'object') return null
    const exportMap = pkgExports as Record<string, unknown>
    if (subpath !== '.' && subpath in exportMap) return resolveConditionalExport(pkgDir, exportMap[subpath])
    if (subpath === '.' && '.' in exportMap) return resolveConditionalExport(pkgDir, exportMap['.'])
    return resolveConditionalExport(pkgDir, exportMap)
  }
  function getSearchPaths(importer: string): string[] {
    const paths: string[] = []
    let currentDir = path.dirname(importer)
    while (true) {
      paths.push(path.join(currentDir, 'node_modules'))
      const parentDir = path.dirname(currentDir)
      if (parentDir === currentDir) break
      currentDir = parentDir
    }
    for (const fallback of fallbackSearchPaths) {
      if (!paths.includes(fallback)) paths.push(fallback)
    }
    return paths
  }
  return {
    name: 'pnpm-resolve',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!isWindows) return null
      if (!importer || !importer.includes('node_modules') || source.startsWith('.') || source.startsWith('/') || source.startsWith('\0')) return null
      const parts = source.startsWith('@') ? source.split('/').slice(0, 2) : [source.split('/')[0]]
      const pkgName = parts.join('/')
      const subpath = '.' + source.slice(pkgName.length)
      for (const base of getSearchPaths(importer)) {
        const pkgDir = path.join(base, ...parts)
        try {
          if (!fs.existsSync(path.join(pkgDir, 'package.json'))) continue
          const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
          if (pkgJson.exports) {
            const exportTarget = resolveExportTarget(pkgDir, pkgJson.exports, subpath)
            if (exportTarget) return exportTarget
          }
          if (subpath !== '.') continue
          if (pkgJson.module) return path.resolve(pkgDir, pkgJson.module)
          if (pkgJson.main) return path.resolve(pkgDir, pkgJson.main)
          return path.resolve(pkgDir, 'index.js')
        } catch { continue }
      }
      return null
    },
  }
}

/** Injects `window.__MD_FEEDBACK_MODE = 'http'` before </head> */
function injectHttpMode(): Plugin {
  return {
    name: 'inject-http-mode',
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `  <script>window.__MD_FEEDBACK_MODE = 'http';</script>\n</head>`,
      )
    },
  }
}

export default defineConfig({
  plugins: [pnpmResolve(), injectHttpMode(), react()],
  root: 'webview',
  base: './',
  resolve: {
    alias: {
      '@tiptap/pm': path.resolve(__dirname, 'node_modules/@tiptap/pm'),
      d3: path.resolve(__dirname, '../../node_modules/.pnpm/d3@7.9.0/node_modules/d3/src/index.js'),
      'd3-array': path.resolve(__dirname, '../../node_modules/.pnpm/d3-array@3.2.4/node_modules/d3-array/src/index.js'),
      'd3-shape': path.resolve(__dirname, '../../node_modules/.pnpm/d3-shape@3.2.0/node_modules/d3-shape/src/index.js'),
      devlop: path.resolve(__dirname, '../../node_modules/.pnpm/devlop@1.1.0/node_modules/devlop/lib/default.js'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../mcp-server/dist/webview'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) return 'style.css'
          return 'assets/[name]-[hash][extname]'
        },
        inlineDynamicImports: true,
      },
    },
  },
})
