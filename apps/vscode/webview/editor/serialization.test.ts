import { describe, it, expect } from 'vitest'
import { serializeWithMemos, collapseBackslashes, serializeHighlightMarks } from './serialization'

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

describe('serializeHighlightMarks', () => {
  it('merges same-color highlights across adjacent blocks into a single mark', () => {
    // Bug #36: selecting 3 paragraphs → should produce 1 HIGHLIGHT_MARK, not 3
    const fakeEditor = {
      state: {
        doc: {
          descendants: (cb: (node: any) => void) => {
            cb({
              isTextblock: true,
              textContent: '첫 번째 문단입니다.',
              forEach: (childCb: (child: any) => void) => {
                childCb({
                  isText: true,
                  text: '첫 번째 문단입니다.',
                  marks: [{ type: { name: 'highlight' }, attrs: { color: '#93c5fd' } }],
                })
              },
            })
            cb({
              isTextblock: true,
              textContent: '두 번째 문단입니다.',
              forEach: (childCb: (child: any) => void) => {
                childCb({
                  isText: true,
                  text: '두 번째 문단입니다.',
                  marks: [{ type: { name: 'highlight' }, attrs: { color: '#93c5fd' } }],
                })
              },
            })
            cb({
              isTextblock: true,
              textContent: '세 번째 문단입니다.',
              forEach: (childCb: (child: any) => void) => {
                childCb({
                  isText: true,
                  text: '세 번째 문단입니다.',
                  marks: [{ type: { name: 'highlight' }, attrs: { color: '#93c5fd' } }],
                })
              },
            })
          },
        },
      },
    }

    const out = serializeHighlightMarks('# Doc', fakeEditor as any)
    const blueMarks = (out.match(/HIGHLIGHT_MARK/g) || []).length
    expect(blueMarks).toBe(1) // ONE merged mark, not 3
    expect(out).toContain('첫 번째 문단입니다. 두 번째 문단입니다. 세 번째 문단입니다.')
  })

  it('does not merge when different colors interrupt the sequence', () => {
    const fakeEditor = {
      state: {
        doc: {
          descendants: (cb: (node: any) => void) => {
            cb({
              isTextblock: true,
              textContent: 'Blue paragraph',
              forEach: (childCb: (child: any) => void) => {
                childCb({
                  isText: true,
                  text: 'Blue paragraph',
                  marks: [{ type: { name: 'highlight' }, attrs: { color: '#93c5fd' } }],
                })
              },
            })
            cb({
              isTextblock: true,
              textContent: 'Red paragraph',
              forEach: (childCb: (child: any) => void) => {
                childCb({
                  isText: true,
                  text: 'Red paragraph',
                  marks: [{ type: { name: 'highlight' }, attrs: { color: '#fca5a5' } }],
                })
              },
            })
            cb({
              isTextblock: true,
              textContent: 'Blue again',
              forEach: (childCb: (child: any) => void) => {
                childCb({
                  isText: true,
                  text: 'Blue again',
                  marks: [{ type: { name: 'highlight' }, attrs: { color: '#93c5fd' } }],
                })
              },
            })
          },
        },
      },
    }

    const out = serializeHighlightMarks('# Doc', fakeEditor as any)
    const blueMarks = (out.match(/color="#93c5fd"/g) || []).length
    const redMarks = (out.match(/color="#fca5a5"/g) || []).length
    // Blue interrupted by red → 2 separate blue marks + 1 red
    expect(blueMarks).toBe(2)
    expect(redMarks).toBe(1)
  })

  it('does not merge when unhighlighted block separates same-color blocks', () => {
    const fakeEditor = {
      state: {
        doc: {
          descendants: (cb: (node: any) => void) => {
            cb({
              isTextblock: true,
              textContent: 'Highlighted first',
              forEach: (childCb: (child: any) => void) => {
                childCb({
                  isText: true,
                  text: 'Highlighted first',
                  marks: [{ type: { name: 'highlight' }, attrs: { color: '#93c5fd' } }],
                })
              },
            })
            cb({
              isTextblock: true,
              textContent: 'Plain text, no highlight',
              forEach: (_childCb: (child: any) => void) => {
                // no highlight marks
              },
            })
            cb({
              isTextblock: true,
              textContent: 'Highlighted second',
              forEach: (childCb: (child: any) => void) => {
                childCb({
                  isText: true,
                  text: 'Highlighted second',
                  marks: [{ type: { name: 'highlight' }, attrs: { color: '#93c5fd' } }],
                })
              },
            })
          },
        },
      },
    }

    const out = serializeHighlightMarks('# Doc', fakeEditor as any)
    const blueMarks = (out.match(/color="#93c5fd"/g) || []).length
    // Separated by unhighlighted block → 2 separate marks
    expect(blueMarks).toBe(2)
  })

  it('handles document with no highlights (empty marks output)', () => {
    const fakeEditor = {
      state: {
        doc: {
          descendants: (cb: (node: any) => void) => {
            cb({
              isTextblock: true,
              textContent: 'Plain paragraph',
              forEach: (_childCb: (child: any) => void) => {
                // no highlight marks
              },
            })
          },
        },
      },
    }

    const out = serializeHighlightMarks('# Doc', fakeEditor as any)
    expect(out).toBe('# Doc')
    expect(out).not.toContain('HIGHLIGHT_MARK')
  })

  it('merges blue across blocks while flushing red when second block lacks it', () => {
    // Block 1: blue + red, Block 2: blue only → blue merges, red flushes
    const fakeEditor = {
      state: {
        doc: {
          descendants: (cb: (node: any) => void) => {
            cb({
              isTextblock: true,
              textContent: 'First block with both colors',
              forEach: (childCb: (child: any) => void) => {
                childCb({
                  isText: true,
                  text: 'Blue part',
                  marks: [{ type: { name: 'highlight' }, attrs: { color: '#93c5fd' } }],
                })
                childCb({
                  isText: true,
                  text: 'Red part',
                  marks: [{ type: { name: 'highlight' }, attrs: { color: '#fca5a5' } }],
                })
              },
            })
            cb({
              isTextblock: true,
              textContent: 'Second block blue only',
              forEach: (childCb: (child: any) => void) => {
                childCb({
                  isText: true,
                  text: 'More blue',
                  marks: [{ type: { name: 'highlight' }, attrs: { color: '#93c5fd' } }],
                })
              },
            })
          },
        },
      },
    }

    const out = serializeHighlightMarks('# Doc', fakeEditor as any)
    const blueMarks = (out.match(/color="#93c5fd"/g) || []).length
    const redMarks = (out.match(/color="#fca5a5"/g) || []).length
    expect(blueMarks).toBe(1) // merged across blocks
    expect(redMarks).toBe(1) // flushed when block 2 lacks red
    expect(out).toContain('text="Blue part More blue"') // blue merged
    expect(out).toContain('text="Red part"') // red standalone
  })


  it('merges same-color fragments within one block into a single mark', () => {
    const fakeEditor = {
      state: {
        doc: {
          descendants: (cb: (node: any) => void) => {
            cb({
              isTextblock: true,
              textContent: '한 번에 묶어서 메모 하나',
              forEach: (childCb: (child: any) => void) => {
                childCb({
                  isText: true,
                  text: '한 번에',
                  marks: [{ type: { name: 'highlight' }, attrs: { color: '#fca5a5' } }],
                })
                childCb({
                  isText: true,
                  text: '질문',
                  marks: [{ type: { name: 'highlight' }, attrs: { color: '#93c5fd' } }],
                })
                childCb({
                  isText: true,
                  text: '묶어서',
                  marks: [{ type: { name: 'highlight' }, attrs: { color: '#fca5a5' } }],
                })
              },
            })
          },
        },
      },
    }

    const out = serializeHighlightMarks('# T', fakeEditor as any)
    const redMarks = (out.match(/color="#fca5a5"/g) || []).length
    const blueMarks = (out.match(/color="#93c5fd"/g) || []).length
    expect(redMarks).toBe(1)
    expect(blueMarks).toBe(1)
    expect(out).toContain('text="한 번에 묶어서"')
  })
})
