import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

export function resolveWorkspaceFrom(argv: string[], env: NodeJS.ProcessEnv): string | undefined {
  const wsArgs = argv.filter(a => a.startsWith('--workspace='))
  const lastArg = wsArgs.length > 0 ? wsArgs[wsArgs.length - 1] : undefined
  if (lastArg) {
    const value = lastArg.slice('--workspace='.length)
    if (value) return value
  }
  return env.MD_FEEDBACK_WORKSPACE || undefined
}

export interface ListWorkspaceDocumentsOptions {
  annotatedOnly?: boolean
  maxFiles?: number
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.md-feedback', 'dist', 'build'])

export function listWorkspaceDocuments(
  workspaceRoot: string,
  options: ListWorkspaceDocumentsOptions = {},
): string[] {
  const annotatedOnly = options.annotatedOnly ?? false
  const maxFiles = options.maxFiles ?? 500
  const base = resolve(workspaceRoot)
  const files: string[] = []

  function walk(dir: string): void {
    if (files.length >= maxFiles) return
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (files.length >= maxFiles) return
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      if (!entry.name.toLowerCase().endsWith('.md')) continue
      const rel = relative(base, full).replace(/\\/g, '/')
      if (!annotatedOnly) {
        files.push(rel)
        continue
      }
      try {
        const content = readFileSync(full, 'utf-8')
        if (content.includes('<!-- USER_MEMO') || content.includes('<!-- HIGHLIGHT_MARK')) {
          files.push(rel)
        }
      } catch {
        // Ignore unreadable files
      }
    }
  }

  try {
    if (statSync(base).isDirectory()) {
      walk(base)
    }
  } catch {
    return []
  }

  return files
}
