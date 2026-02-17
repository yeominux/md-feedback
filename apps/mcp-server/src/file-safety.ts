import path from 'node:path'

export interface FileSafetyConfig {
  workspaceRoot: string
  blocklist: string[]
  allowlist: string[]
}

const DEFAULT_BLOCKLIST = [
  '**/.env',
  '**/.env.*',
  '**/credentials*',
  '**/secrets*',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/node_modules/**',
  '**/.git/**',
]

export function createFileSafety(workspaceRoot?: string): FileSafetyConfig {
  return {
    workspaceRoot: workspaceRoot || process.cwd(),
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

  // Check: path traversal — is the resolved path within workspaceRoot?
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    return { safe: false, reason: `Path "${filePath}" resolves outside workspace root` }
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
