import path from 'node:path'
import { openSync, closeSync, unlinkSync } from 'node:fs'

const locks = new Map<string, Promise<void>>()
const FILE_LOCK_TIMEOUT_MS = 5000
const FILE_LOCK_POLL_MS = 20

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function acquireFileLock(lockPath: string, timeoutMs = FILE_LOCK_TIMEOUT_MS): Promise<() => void> {
  const start = Date.now()
  while (true) {
    try {
      const fd = openSync(lockPath, 'wx')
      return () => {
        try { closeSync(fd) } catch { /* ignore */ }
        try { unlinkSync(lockPath) } catch { /* ignore */ }
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'EEXIST') throw err
      if (Date.now() - start > timeoutMs) {
        throw new Error(`File lock timeout for ${lockPath}`)
      }
      await sleep(FILE_LOCK_POLL_MS)
    }
  }
}

export async function withFileLock<T>(filePath: string, fn: () => T | Promise<T>): Promise<T> {
  const key = path.resolve(filePath)
  const lockPath = `${key}.md-feedback.lock`
  while (locks.has(key)) {
    await locks.get(key)
  }
  let resolve!: () => void
  locks.set(key, new Promise<void>(r => { resolve = r }))
  const releaseFileLock = await acquireFileLock(lockPath)
  try {
    return await fn()
  } finally {
    releaseFileLock()
    locks.delete(key)
    resolve()
  }
}
