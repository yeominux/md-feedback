import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// pnpm strict mode breaks transitive dep resolution for packages with
// undeclared dependencies (e.g. mermaid -> langium -> @chevrotain/*).
// This plugin manually resolves bare specifiers from the workspace's
// node_modules, handling ESM exports maps that require.resolve misses.
function pnpmResolve(): import('vite').Plugin {
  const searchPaths = [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, '../../node_modules/.pnpm/node_modules'),
    path.resolve(__dirname, '../../node_modules'),
  ]
  return {
    name: 'pnpm-resolve',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !importer.includes('node_modules') || source.startsWith('.') || source.startsWith('/') || source.startsWith('\0')) {
        return null
      }
      const parts = source.startsWith('@') ? source.split('/').slice(0, 2) : [source.split('/')[0]]
      const pkgName = parts.join('/')
      const subpath = '.' + source.slice(pkgName.length)
      for (const base of searchPaths) {
      const pkgDir = path.join(base, ...parts)
      try {
        if (!fs.existsSync(path.join(pkgDir, 'package.json'))) continue
        const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
        // Check exports map for the subpath
        if (pkgJson.exports) {
          const exp = pkgJson.exports[subpath]
          if (typeof exp === 'string') return path.resolve(pkgDir, exp)
          if (exp?.import) return path.resolve(pkgDir, exp.import)
          if (exp?.default) return path.resolve(pkgDir, exp.default)
        }
        if (subpath !== '.') continue
        if (pkgJson.module) return path.resolve(pkgDir, pkgJson.module)
        if (pkgJson.main) return path.resolve(pkgDir, pkgJson.main)
        return path.resolve(pkgDir, 'index.js')
      } catch {
        continue
      }
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [pnpmResolve(), react()],
  root: 'webview',
  base: './',
  resolve: {
    alias: {
      '@tiptap/pm': path.resolve(__dirname, 'node_modules/@tiptap/pm'),
    },
  },
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) return 'style.css'
          return 'assets/[name]-[hash][extname]'
        },
        // Bundle everything into a single file to avoid
        // dynamic import failures in VS Code webview CSP
        inlineDynamicImports: true,
      },
    },
  },
})
