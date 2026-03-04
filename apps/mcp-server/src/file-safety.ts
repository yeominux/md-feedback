import path from 'node:path'
import { existsSync, realpathSync } from 'node:fs'

export interface FileSafetyConfig {
  workspaceRoot: string
  blocklist: string[]
  allowlist: string[]
}

const DEFAULT_BLOCKLIST = [
  '**/.env',
  '.env',
  '**/.env.*',
  '.env.*',
  '**/credentials*',
  'credentials*',
  '**/secrets*',
  'secrets*',
  '**/*.pem',
  '*.pem',
  '**/*.key',
  '*.key',
  '**/*.p12',
  '*.p12',
  '**/node_modules/**',
  'node_modules/**',
  '**/.git/**',
  '.git/**',
]

export function createFileSafety(workspaceRoot?: string): FileSafetyConfig {
  return {
    workspaceRoot: workspaceRoot || process.env.MD_FEEDBACK_WORKSPACE || process.cwd(),
    blocklist: [...DEFAULT_BLOCKLIST],
    allowlist: [],
  }
}

/** Simple glob matching — supports ** and * wildcards */
function matchGlob(pattern: string, filePath: string): boolean {
  // Normalize separators
  const normalized = filePath.replace(/\\/g, '/')
  const normalizedPattern = pattern.replace(/\\/g, '/')

  // Convert glob to regex
  const regexStr = normalizedPattern
    .replace(/[.+^${}()|[\]]/g, '\\$&')  // escape regex special chars (except * and ?)
    .replace(/\*\*/g, '\u0000')            // temporarily replace **
    .replace(/\*/g, '[^/]*')               // * matches anything except /
    .replace(/\u0000/g, '.*')              // ** matches anything including /
    .replace(/\?/g, '[^/]')               // ? matches single char except /

  return new RegExp(`^${regexStr}$`).test(normalized)
}

function matchesAny(patterns: string[], filePath: string): boolean {
  return patterns.some(pattern => matchGlob(pattern, filePath))
}

export function validateFilePath(
  config: FileSafetyConfig,
  filePath: string,
): { safe: boolean; reason?: string } {
  // Resolve to absolute path
  const resolved = path.resolve(config.workspaceRoot, filePath)
  const normalizedRoot = path.resolve(config.workspaceRoot)

  // On Windows, drive letters are case-insensitive, so normalize before comparison
  const isWithin = (child: string, parent: string): boolean => {
    if (process.platform === 'win32') {
      return child.toLowerCase().startsWith((parent + path.sep).toLowerCase())
        || child.toLowerCase() === parent.toLowerCase()
    }
    return child.startsWith(parent + path.sep) || child === parent
  }

  // Check: path traversal — is the resolved path within workspaceRoot?
  if (!isWithin(resolved, normalizedRoot)) {
    return { safe: false, reason: `Path "${filePath}" resolves outside workspace root` }
  }

  // Check: symlink escape — verify realpath stays within workspace
  if (existsSync(resolved)) {
    try {
      const realResolved = realpathSync(resolved)
      const realRoot = realpathSync(normalizedRoot)
      if (!isWithin(realResolved, realRoot)) {
        return { safe: false, reason: `Path "${filePath}" resolves outside workspace via symlink` }
      }
    } catch { /* ENOENT — new file, skip */ }
  }

  // Get relative path for glob matching
  const relative = path.relative(normalizedRoot, resolved).replace(/\\/g, '/')

  // Check: blocklist
  if (matchesAny(config.blocklist, relative)) {
    return { safe: false, reason: `Path "${filePath}" matches blocklist pattern` }
  }

  // Check: allowlist (if set, only allowed paths pass)
  if (config.allowlist.length > 0 && !matchesAny(config.allowlist, relative)) {
    return { safe: false, reason: `Path "${filePath}" not in allowlist` }
  }

  return { safe: true }
}

export function validateOperation(
  config: FileSafetyConfig,
  operation: { type: string; file: string },
): { safe: boolean; reason?: string } {
  return validateFilePath(config, operation.file)
}
