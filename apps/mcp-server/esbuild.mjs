import * as esbuild from 'esbuild'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const sharedEntry = path.resolve(__dirname, '../../packages/shared/src/index.ts')

await esbuild.build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  outfile: 'dist/mcp-server.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  banner: { js: '#!/usr/bin/env node' },
  external: [],
  alias: {
    '@md-feedback/shared': sharedEntry,
  },
  sourcemap: true,
  define: { '__VERSION__': JSON.stringify(pkg.version) },
})
