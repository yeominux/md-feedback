import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, isAbsolute, dirname, join } from 'path'

/** Resolve file path: supports both absolute and relative (resolved against CWD) */
function resolvePath(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath)
}

export function readMarkdownFile(filePath: string): string {
  const resolved = resolvePath(filePath)
  if (!existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`)
  }
  try {
    return readFileSync(resolved, 'utf-8')
  } catch (err) {
    throw new Error(`Cannot read file ${resolved}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export function writeMarkdownFile(filePath: string, content: string): void {
  const resolved = resolvePath(filePath)
  try {
    writeFileSync(resolved, content, 'utf-8')
  } catch (err) {
    throw new Error(`Cannot write file ${resolved}: ${err instanceof Error ? err.message : String(err)}`)
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

/** Appends to .md-feedback/progress.json. */
export function appendProgress(mdFilePath: string, entry: ProgressEntry): void {
  const sidecar = ensureSidecar(mdFilePath)
  const progressPath = join(sidecar, 'progress.json')
  const entries = readProgress(mdFilePath)
  entries.push(entry)
  writeFileSync(progressPath, JSON.stringify(entries, null, 2), 'utf-8')
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
