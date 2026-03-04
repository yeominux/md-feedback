import { describe, it, expect, vi, afterEach } from 'vitest'
import path from 'node:path'
import { createFileSafety, validateFilePath } from './file-safety.js'

describe('validateFilePath', () => {
  const root = '/workspace/project'
  const config = createFileSafety(root)

  it('allows a file inside workspace', () => {
    const result = validateFilePath(config, 'docs/file.md')
    expect(result.safe).toBe(true)
  })

  it('blocks path traversal outside workspace', () => {
    const result = validateFilePath(config, '../outside/file.md')
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('resolves outside workspace root')
  })

  it('blocks .env (blocklist)', () => {
    const result = validateFilePath(config, '.env')
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('blocklist')
  })

  it('allows workspace root itself', () => {
    const result = validateFilePath(config, '.')
    expect(result.safe).toBe(true)
  })
})

describe('validateFilePath — Windows drive letter casing (issue #2)', () => {
  // validateFilePath calls path.resolve twice:
  //   1st: path.resolve(workspaceRoot, filePath) → resolved
  //   2nd: path.resolve(workspaceRoot)           → normalizedRoot
  afterEach(() => vi.restoreAllMocks())

  it('allows file when incoming path has lowercase drive letter but root has uppercase', () => {
    const config = createFileSafety('D:\\Work Files\\project')
    const resolveSpy = vi.spyOn(path, 'resolve')
      .mockImplementationOnce(() => 'd:\\Work Files\\project\\docs\\file.md') // resolved (1st)
      .mockImplementationOnce(() => 'D:\\Work Files\\project')                 // normalizedRoot (2nd)

    const result = validateFilePath(config, 'd:\\Work Files\\project\\docs\\file.md')
    expect(result.safe).toBe(true)
    resolveSpy.mockRestore()
  })

  it('allows file when incoming path has uppercase drive letter but root has lowercase', () => {
    const config = createFileSafety('d:\\Work Files\\project')
    const resolveSpy = vi.spyOn(path, 'resolve')
      .mockImplementationOnce(() => 'D:\\Work Files\\project\\docs\\file.md') // resolved (1st)
      .mockImplementationOnce(() => 'd:\\Work Files\\project')                 // normalizedRoot (2nd)

    const result = validateFilePath(config, 'D:\\Work Files\\project\\docs\\file.md')
    expect(result.safe).toBe(true)
    resolveSpy.mockRestore()
  })

  it('still blocks path traversal on Windows', () => {
    const config = createFileSafety('D:\\Work Files\\project')
    const resolveSpy = vi.spyOn(path, 'resolve')
      .mockImplementationOnce(() => 'D:\\Other\\evil.md')   // resolved (1st)
      .mockImplementationOnce(() => 'D:\\Work Files\\project') // normalizedRoot (2nd)

    const result = validateFilePath(config, '..\\..\\Other\\evil.md')
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('resolves outside workspace root')
    resolveSpy.mockRestore()
  })
})
