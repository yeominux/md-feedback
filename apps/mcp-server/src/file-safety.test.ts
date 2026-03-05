import { describe, expect, it } from 'vitest'
import { createFileSafety, validateFilePath } from './file-safety'

describe('validateFilePath — path containment', () => {
  it('allows a path inside workspace root (same casing)', () => {
    const config = createFileSafety('C:\\Work\\project')
    const result = validateFilePath(config, 'C:\\Work\\project\\docs\\file.md')
    expect(result.safe).toBe(true)
  })

  it('rejects a path outside workspace root', () => {
    const config = createFileSafety('/work/project')
    const result = validateFilePath(config, '/work/other/file.md')
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('resolves outside workspace root')
  })

  it('rejects path traversal attempt', () => {
    const config = createFileSafety('/home/user/project')
    const result = validateFilePath(config, '../outside/file.md')
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('resolves outside workspace root')
  })

  it('rejects .env (blocklist)', () => {
    const config = createFileSafety('/home/user/project')
    const result = validateFilePath(config, '/home/user/project/.env')
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('blocklist')
  })
})

// Windows drive letter case-insensitivity tests require Windows path semantics
// (path.resolve uses backslash separators and drive letters on win32 only)
describe('validateFilePath — Windows drive letter case-insensitivity (Issue #2)', () => {
  it.skipIf(process.platform !== 'win32')('allows path when workspace root has uppercase drive letter and path has lowercase', () => {
    const config = createFileSafety('D:\\Work Files\\project')
    // Simulate MCP client sending lowercase drive letter
    const result = validateFilePath(config, 'd:\\Work Files\\project\\docs\\file.md')
    expect(result.safe).toBe(true)
  })

  it.skipIf(process.platform !== 'win32')('allows path when workspace root has lowercase drive letter and path has uppercase', () => {
    const config = createFileSafety('d:\\Work Files\\project')
    const result = validateFilePath(config, 'D:\\Work Files\\project\\docs\\file.md')
    expect(result.safe).toBe(true)
  })

  it.skipIf(process.platform !== 'win32')('still rejects path outside workspace root on Windows', () => {
    const config = createFileSafety('D:\\Work\\project')
    const result = validateFilePath(config, 'd:\\Work\\other\\file.md')
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('resolves outside workspace root')
  })
})
