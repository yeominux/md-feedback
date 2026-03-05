import { describe, expect, it, vi, afterEach } from 'vitest'
import { createFileSafety, validateFilePath } from './file-safety'

describe('validateFilePath — path containment', () => {
  it('allows a path inside workspace root (same casing)', () => {
    const config = createFileSafety('C:\\Work\\project')
    const result = validateFilePath(config, 'C:\\Work\\project\\docs\\file.md')
    expect(result.safe).toBe(true)
  })

  it('rejects a path outside workspace root', () => {
    const config = createFileSafety('C:\\Work\\project')
    const result = validateFilePath(config, 'C:\\Work\\other\\file.md')
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

describe('validateFilePath — Windows drive letter case-insensitivity (Issue #2)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('allows path when workspace root has uppercase drive letter and path has lowercase', () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const config = createFileSafety('D:\\Work Files\\project')
    // Simulate MCP client sending lowercase drive letter
    const result = validateFilePath(config, 'd:\\Work Files\\project\\docs\\file.md')
    expect(result.safe).toBe(true)
  })

  it('allows path when workspace root has lowercase drive letter and path has uppercase', () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const config = createFileSafety('d:\\Work Files\\project')
    const result = validateFilePath(config, 'D:\\Work Files\\project\\docs\\file.md')
    expect(result.safe).toBe(true)
  })

  it('still rejects path outside workspace root on Windows', () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const config = createFileSafety('D:\\Work\\project')
    const result = validateFilePath(config, 'd:\\Work\\other\\file.md')
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('resolves outside workspace root')
  })
})
