import { describe, expect, it } from 'vitest'
import { resolveWorkspaceFrom } from './workspace'

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
