#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const root = process.cwd()

const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
])

const IGNORE_FILES = new Set([
  'pnpm-lock.yaml',
  'guard-public-surface.mjs',
])

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.svg',
  '.gitignore',
  '.npmignore',
])

// Forbidden patterns are injected via GUARD_PATTERNS env var (comma-separated
// base64 strings) to avoid leaking internal identifiers in the public repo.
// Set the GitHub Actions secret GUARD_PATTERNS to enable this check in CI.
const raw = process.env.GUARD_PATTERNS ?? ''
const FORBIDDEN_PATTERNS = raw
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(e => new RegExp(Buffer.from(e, 'base64').toString(), 'i'))

function isTextFile(filePath) {
  const base = filePath.split('/').pop() ?? filePath
  if (base.startsWith('.') && !base.includes('.')) return false
  const dot = base.lastIndexOf('.')
  const ext = dot >= 0 ? base.slice(dot) : base
  return TEXT_EXTENSIONS.has(ext)
}

function walk(dirPath, out) {
  const entries = readdirSync(dirPath)
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry)) continue
    const fullPath = join(dirPath, entry)
    const relPath = relative(root, fullPath).replaceAll('\\', '/')
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      walk(fullPath, out)
      continue
    }
    if (IGNORE_FILES.has(entry)) continue
    if (!isTextFile(relPath)) continue
    out.push(relPath)
  }
}

const files = []
walk(root, files)

const violations = []
for (const filePath of files) {
  const content = readFileSync(join(root, filePath), 'utf8')
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        violations.push(`${filePath}:${i + 1}: ${line.trim()}`)
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Public surface guard failed. Forbidden content detected:')
  for (const v of violations) console.error(`- ${v}`)
  process.exit(1)
}

if (FORBIDDEN_PATTERNS.length === 0) {
  console.log('Public surface guard skipped (GUARD_PATTERNS not set)')
} else {
  console.log(`Public surface guard passed (${FORBIDDEN_PATTERNS.length} patterns checked)`)
}
