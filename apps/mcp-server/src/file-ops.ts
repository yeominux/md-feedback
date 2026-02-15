import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, isAbsolute } from 'path'

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
