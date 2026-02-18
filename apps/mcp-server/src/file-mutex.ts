import path from 'node:path'

const locks = new Map<string, Promise<void>>()

export async function withFileLock<T>(filePath: string, fn: () => T | Promise<T>): Promise<T> {
  const key = path.resolve(filePath)
  while (locks.has(key)) {
    await locks.get(key)
  }
  let resolve!: () => void
  locks.set(key, new Promise<void>(r => { resolve = r }))
  try {
    return await fn()
  } finally {
    locks.delete(key)
    resolve()
  }
}
