#!/usr/bin/env node
import { execFileSync } from 'child_process'
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

// Strict allowlist: every tracked file on public branches must match one of
// these patterns. New public paths require explicit policy updates.
const ALLOWED_PATH_PATTERNS = [
  /^apps\//,
  /^packages\//,
  /^scripts\//,
  /^demos\//,
  /^assets\//,
  /^\.github\//,
  /^\.githooks\//,
  /^README(?:\.ko)?\.md$/i,
  /^CHANGELOG\.md$/i,
  /^CONTRIBUTING\.md$/i,
  /^SECURITY\.md$/i,
  /^PRIVACY\.md$/i,
  /^PUBLISHING\.md$/i,
  /^LICENSE$/i,
  /^package\.json$/i,
  /^pnpm-workspace\.yaml$/i,
  /^pnpm-lock\.yaml$/i,
  /^vitest\.config\.ts$/i,
  /^\.gitignore$/i,
  /^\.npmrc$/i,
  /^\.mcp\.json$/i,
  /^llms\.txt$/i,
]

// Always-blocked paths/files on public surface. This is independent from
// secret-driven content scanning so CI always enforces baseline policy.
const BLOCKED_PATH_PATTERNS = [
  /^docs\/architecture\//,
  /^docs\/pr\//,
  /^\.md-feedback\//,
  /^operational\//,
  /^AGENTS\.md$/i,
  /^CLAUDE\.md$/i,
  /^README_MCP_SETUP\.md$/i,
  /^RELEASE_NOTES\.md$/i,
  /^mcp-config.*\.json$/i,
  /^run_mcp\.bat$/i,
]

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
  let entries = []
  try {
    entries = readdirSync(dirPath)
  } catch {
    return
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry)) continue
    const fullPath = join(dirPath, entry)
    const relPath = relative(root, fullPath).replaceAll('\\', '/')
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      // Skip transient/dangling entries instead of failing the entire guard.
      continue
    }
    if (stat.isDirectory()) {
      walk(fullPath, out)
      continue
    }
    if (IGNORE_FILES.has(entry)) continue
    if (!isTextFile(relPath)) continue
    out.push(relPath)
  }
}

function listTrackedFiles() {
  try {
    const out = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim()
    if (!out) return []
    return out
      .split('\n')
      .map(s => s.trim().replaceAll('\\', '/'))
      .filter(Boolean)
  } catch {
    return []
  }
}

function blockedPathViolations(paths) {
  return paths.filter(filePath => BLOCKED_PATH_PATTERNS.some(re => re.test(filePath)))
}

function allowlistViolations(paths) {
  return paths.filter(filePath => !ALLOWED_PATH_PATTERNS.some(re => re.test(filePath)))
}

const files = []
walk(root, files)

const trackedFiles = listTrackedFiles()
const blockedFiles = blockedPathViolations(trackedFiles)
if (blockedFiles.length > 0) {
  console.error('Public surface guard failed. Blocked path(s) are tracked:')
  for (const f of blockedFiles) console.error(`- ${f}`)
  process.exit(1)
}

const nonAllowlisted = allowlistViolations(trackedFiles)
if (nonAllowlisted.length > 0) {
  console.error('Public surface guard failed. Non-allowlisted tracked file(s) found:')
  for (const f of nonAllowlisted) console.error(`- ${f}`)
  process.exit(1)
}

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
  console.log('Public surface guard passed (path policy only; GUARD_PATTERNS not set)')
} else {
  console.log(`Public surface guard passed (${FORBIDDEN_PATTERNS.length} patterns checked)`)
}
