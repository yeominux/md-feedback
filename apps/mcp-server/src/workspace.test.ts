import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SAFE_TMPDIR = process.env['TEMP'] && !/[^\x00-\x7F]/.test(process.env['TEMP'])
  ? process.env['TEMP']
  : 'C:\\Windows\\Temp'
import { listWorkspaceDocuments, resolveWorkspaceFrom } from './workspace'

describe('resolveWorkspaceFrom', () => {
  it('parses --workspace= with additional "=" in path', () => {
    const value = resolveWorkspaceFrom(
      ['node', 'server.js', '--workspace=C:\\work\\a=b\\repo'],
      {},
    )
    expect(value).toBe('C:\\work\\a=b\\repo')
  })

  it('falls back to env var when arg is missing', () => {
    const value = resolveWorkspaceFrom(
      ['node', 'server.js'],
      { MD_FEEDBACK_WORKSPACE: 'C:\\env\\repo' },
    )
    expect(value).toBe('C:\\env\\repo')
  })

  it('falls back to env var when --workspace= is empty', () => {
    const value = resolveWorkspaceFrom(
      ['node', 'server.js', '--workspace='],
      { MD_FEEDBACK_WORKSPACE: 'C:\\env\\repo' },
    )
    expect(value).toBe('C:\\env\\repo')
  })

  it('returns undefined when --workspace= is empty and env is missing', () => {
    const value = resolveWorkspaceFrom(
      ['node', 'server.js', '--workspace='],
      {},
    )
    expect(value).toBeUndefined()
  })

  it('uses the last --workspace= when multiple args are provided', () => {
    const value = resolveWorkspaceFrom(
      ['node', 'server.js', '--workspace=C:\\first', '--workspace=C:\\second'],
      { MD_FEEDBACK_WORKSPACE: 'C:\\env\\repo' },
    )
    expect(value).toBe('C:\\second')
  })
})

describe('listWorkspaceDocuments', () => {
  it('lists markdown files in workspace and can filter annotated-only', () => {
    const workspace = mkdtempSync(join(SAFE_TMPDIR,'md-feedback-workspace-test-'))
    try {
      writeFileSync(join(workspace, 'a.md'), '# A\n', 'utf-8')
      writeFileSync(join(workspace, 'b.md'), '# B\n<!-- USER_MEMO id="m1" color="red" status="open" : fix -->\n', 'utf-8')
      writeFileSync(join(workspace, 'c.txt'), 'not markdown', 'utf-8')
      mkdirSync(join(workspace, 'node_modules'), { recursive: true })
      writeFileSync(join(workspace, 'node_modules', 'ignored.md'), '# ignored\n', 'utf-8')

      const all = listWorkspaceDocuments(workspace, { annotatedOnly: false })
      const annotated = listWorkspaceDocuments(workspace, { annotatedOnly: true })

      expect(all).toEqual(expect.arrayContaining(['a.md', 'b.md']))
      expect(all).not.toContain('node_modules/ignored.md')
      expect(annotated).toEqual(['b.md'])
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
