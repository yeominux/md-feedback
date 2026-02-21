import { describe, it, expect } from 'vitest'
import { serializeWithMemos, collapseBackslashes } from './serialization'

describe('collapseBackslashes', () => {
  it('collapses double-escaped backslashes before backslash (\\\\\\\\→ \\\\)', () => {
    // 4 backslashes at runtime → collapse to 2 (\\{2,}\\ → \\)
    expect(collapseBackslashes('path\\\\\\\\')).toBe('path\\\\')
  })

  it('collapses accumulated backslashes before underscore', () => {
    expect(collapseBackslashes('some\\\\_text')).toBe('some\\_text')
  })

  it('collapses escaped asterisks', () => {
    expect(collapseBackslashes('some \\\\*text\\\\*')).toBe('some \\*text\\*')
  })

  it('preserves single backslash escapes (no false collapse)', () => {
    expect(collapseBackslashes('some \\*text\\*')).toBe('some \\*text\\*')
  })

  it('preserves backslashes inside fenced code blocks', () => {
    const input = 'before \\\\*bold\\\\*\n```\nC:\\\\\\\\path\n```\nafter \\\\*text\\\\*'
    const result = collapseBackslashes(input)
    expect(result).toContain('C:\\\\\\\\path') // code block preserved
    expect(result).toMatch(/^before \\\*bold\\\*/) // outside collapsed
  })

  it('handles text without backslashes (no-op)', () => {
    expect(collapseBackslashes('plain text here')).toBe('plain text here')
  })

  it('handles empty string', () => {
    expect(collapseBackslashes('')).toBe('')
  })
})

describe('serializeWithMemos — anchorText preservation', () => {
  it('preserves data-memo-anchor attribute as anchorText in output', () => {
    const input = '<div data-memo-block data-memo-id="m1" data-memo-text="Fix" data-memo-color="red" data-memo-status="open" data-memo-anchor="Anchor line">memo: Fix</div>'
    const result = serializeWithMemos(input)
    expect(result).toContain('anchorText="Anchor line"')
    expect(result).toContain('id="m1"')
  })

  it('outputs empty anchorText when data-memo-anchor is absent', () => {
    const input = '<div data-memo-block data-memo-id="m1" data-memo-text="Fix" data-memo-color="red" data-memo-status="open">memo: Fix</div>'
    const result = serializeWithMemos(input)
    expect(result).toContain('anchorText=""')
    expect(result).toContain('id="m1"')
  })
})
