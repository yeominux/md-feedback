import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync, readdirSync } from 'fs'
import { resolve, isAbsolute, dirname, join } from 'path'
import { randomBytes } from 'node:crypto'
import { FileNotFoundError, FileReadError, FileWriteError } from './errors.js'
import { withFileLock } from './file-mutex.js'
import type { MemoImpl, Checkpoint, PlanCursor, SidecarMetadata } from '@md-feedback/shared'

const MAX_SNAPSHOTS = 20

/** Resolve file path: supports both absolute and relative (resolved against CWD) */
function resolvePath(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath)
}

export function readMarkdownFile(filePath: string): string {
  const resolved = resolvePath(filePath)
  if (!existsSync(resolved)) {
    throw new FileNotFoundError(resolved)
  }
  try {
    return readFileSync(resolved, 'utf-8')
  } catch (err) {
    throw new FileReadError(resolved, err instanceof Error ? err.message : String(err))
  }
}

export function writeMarkdownFile(filePath: string, content: string): void {
  const resolved = resolvePath(filePath)
  const dir = dirname(resolved)
  const tmpPath = join(dir, `.mf-tmp-${randomBytes(6).toString('hex')}`)
  try {
    writeFileSync(tmpPath, content, 'utf-8')
    renameSync(tmpPath, resolved)
  } catch (err) {
    try { unlinkSync(tmpPath) } catch { /* ignore */ }
    throw new FileWriteError(resolved, err instanceof Error ? err.message : String(err))
  }
}

// ─── Sidecar directory operations (.md-feedback/) ───

interface ProgressEntry {
  memoId: string
  status: string
  message: string
  timestamp: string
}

/** Creates .md-feedback/ directory next to the markdown file if it doesn't exist. Returns the sidecar directory path. */
export function ensureSidecar(mdFilePath: string): string {
  const resolved = resolvePath(mdFilePath)
  const dir = join(dirname(resolved), '.md-feedback')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** Writes a timestamped backup to .md-feedback/snapshots/. Returns snapshot file path. */
export function writeSnapshot(mdFilePath: string, content: string): string {
  const sidecar = ensureSidecar(mdFilePath)
  const snapshotsDir = join(sidecar, 'snapshots')
  if (!existsSync(snapshotsDir)) {
    mkdirSync(snapshotsDir, { recursive: true })
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const snapshotPath = join(snapshotsDir, `snapshot-${ts}.md`)
  writeFileSync(snapshotPath, content, 'utf-8')

  // Keep at most MAX_SNAPSHOTS snapshots
  const files = readdirSync(snapshotsDir).filter(f => f.startsWith('snapshot-')).sort()
  while (files.length > MAX_SNAPSHOTS) {
    try { unlinkSync(join(snapshotsDir, files.shift()!)) } catch { /* ignore */ }
  }

  return snapshotPath
}

/** Reads .md-feedback/progress.json, returns [] if doesn't exist. */
export function readProgress(mdFilePath: string): ProgressEntry[] {
  const sidecar = ensureSidecar(mdFilePath)
  const progressPath = join(sidecar, 'progress.json')
  if (!existsSync(progressPath)) return []
  try {
    return JSON.parse(readFileSync(progressPath, 'utf-8'))
  } catch {
    return []
  }
}

/** Appends to .md-feedback/progress.json with per-file lock + atomic write. */
export async function appendProgress(mdFilePath: string, entry: ProgressEntry): Promise<void> {
  const sidecar = ensureSidecar(mdFilePath)
  const progressPath = join(sidecar, 'progress.json')

  await withFileLock(progressPath, async () => {
    let entries: ProgressEntry[] = []
    if (existsSync(progressPath)) {
      try {
        entries = JSON.parse(readFileSync(progressPath, 'utf-8'))
      } catch {
        entries = []
      }
    }
    entries.push(entry)

    const tmpPath = `${progressPath}.tmp-${randomBytes(6).toString('hex')}`
    writeFileSync(tmpPath, JSON.stringify(entries, null, 2), 'utf-8')
    renameSync(tmpPath, progressPath)
  })
}

// ─── Operational metadata sidecar (.md-feedback/operational-meta.json) ───

interface OperationalMeta {
  impls: MemoImpl[]
  checkpoints: Checkpoint[]
  cursor: PlanCursor | null
}

/** Write canonical sidecar metadata to .md-feedback/metadata.json (atomic). */
export function writeMetadataSidecar(mdFilePath: string, metadata: SidecarMetadata): void {
  const sidecar = ensureSidecar(mdFilePath)
  const metadataPath = join(sidecar, 'metadata.json')
  const tmpPath = `${metadataPath}.tmp-${randomBytes(6).toString('hex')}`
  try {
    writeFileSync(tmpPath, JSON.stringify(metadata, null, 2), 'utf-8')
    renameSync(tmpPath, metadataPath)
  } catch (err) {
    try { unlinkSync(tmpPath) } catch { /* ignore */ }
    throw new FileWriteError(metadataPath, err instanceof Error ? err.message : String(err))
  }
}

/** Read canonical sidecar metadata from .md-feedback/metadata.json.
 *  Compatibility: also reads legacy operational-meta.json and fills missing impl/checkpoint entries. */
export function readMetadataSidecar(mdFilePath: string): SidecarMetadata | null {
  const resolved = resolvePath(mdFilePath)
  const metadataPath = join(dirname(resolved), '.md-feedback', 'metadata.json')

  let primary: SidecarMetadata | null = null
  if (existsSync(metadataPath)) {
    try {
      const parsed = JSON.parse(readFileSync(metadataPath, 'utf-8')) as Partial<SidecarMetadata>
      primary = {
        version: '1.0',
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        impls: Array.isArray(parsed.impls) ? parsed.impls : [],
        artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
        dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies : [],
        checkpoints: Array.isArray(parsed.checkpoints) ? parsed.checkpoints : [],
      }
    } catch {
      primary = null
    }
  }

  const legacy = readOperationalMeta(mdFilePath)
  if (!primary && !legacy) return null

  if (!primary) {
    return {
      version: '1.0',
      updatedAt: new Date().toISOString(),
      impls: legacy?.impls || [],
      artifacts: [],
      dependencies: [],
      checkpoints: legacy?.checkpoints || [],
    }
  }

  if (!legacy) return primary

  const dedupById = <T extends { id: string }>(base: T[], fallback: T[]): T[] => {
    const ids = new Set(base.map(item => item.id))
    return [...base, ...fallback.filter(item => !ids.has(item.id))]
  }

  return {
    ...primary,
    impls: dedupById(primary.impls, legacy.impls || []),
    checkpoints: dedupById(primary.checkpoints, legacy.checkpoints || []),
  }
}

/** Write operational metadata to .md-feedback/operational-meta.json (atomic). */
export function writeOperationalMeta(mdFilePath: string, data: OperationalMeta): void {
  const sidecar = ensureSidecar(mdFilePath)
  const metaPath = join(sidecar, 'operational-meta.json')
  const tmpPath = `${metaPath}.tmp-${randomBytes(6).toString('hex')}`
  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
    renameSync(tmpPath, metaPath)
  } catch (err) {
    try { unlinkSync(tmpPath) } catch { /* ignore */ }
    throw new FileWriteError(metaPath, err instanceof Error ? err.message : String(err))
  }
}

/** Read operational metadata from .md-feedback/operational-meta.json. Returns null if missing. */
export function readOperationalMeta(mdFilePath: string): OperationalMeta | null {
  const resolved = resolvePath(mdFilePath)
  const metaPath = join(dirname(resolved), '.md-feedback', 'operational-meta.json')
  if (!existsSync(metaPath)) return null
  try {
    return JSON.parse(readFileSync(metaPath, 'utf-8'))
  } catch {
    return null
  }
}

/** Writes a transaction record to .md-feedback/transactions/. Returns transaction file path. */
export function writeTransaction(mdFilePath: string, transaction: object): string {
  const sidecar = ensureSidecar(mdFilePath)
  const txDir = join(sidecar, 'transactions')
  if (!existsSync(txDir)) {
    mkdirSync(txDir, { recursive: true })
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const txPath = join(txDir, `tx-${ts}.json`)
  writeFileSync(txPath, JSON.stringify(transaction, null, 2), 'utf-8')
  return txPath
}
