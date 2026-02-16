import { describe, it, expect } from 'vitest'
import { convertMemosToHtml, extractMemos } from '../markdown-roundtrip'

describe('markdown-roundtrip — extractMemos', () => {
  it('extracts v0.3 single-line memo from markdown', () => {
    const markdown = `# Test Document

Some content here.
<!-- USER_MEMO id="m1" color="red" status="open" : Fix this typo -->

More content.`

    const result = extractMemos(markdown)
    
    expect(result.memos).toHaveLength(1)
    expect(result.memos[0].id).toBe('m1')
    expect(result.memos[0].color).toBe('red')
    expect(result.memos[0].text).toBe('Fix this typo')
  })

  it('returns empty memos array for empty markdown', () => {
    const result = extractMemos('')
    
    expect(result.memos).toEqual([])
    expect(result.markdown).toBe('')
  })

  it('returns empty memos array for markdown with no memos', () => {
    const markdown = `# Test Document

Some content without any memos.`

    const result = extractMemos(markdown)
    
    expect(result.memos).toEqual([])
  })
})

describe('markdown-roundtrip — convertMemosToHtml', () => {
  it('normalizes hex memo colors to named colors for memoBlock rendering', () => {
    const markdown = `# Plan

Paragraph.
<!-- USER_MEMO id="m-hex" color="#fca5a5" status="open" : fix this -->`

    const html = convertMemosToHtml(markdown)

    expect(html).toContain('data-memo-id="m-hex"')
    expect(html).toContain('data-memo-color="red"')
    expect(html).not.toContain('data-memo-color="#fca5a5"')
  })

  it('normalizes unknown memo colors to red fallback', () => {
    const markdown = `# Plan

Paragraph.
<!-- USER_MEMO id="m-unknown" color="purple" status="open" : fallback -->`

    const html = convertMemosToHtml(markdown)

    expect(html).toContain('data-memo-id="m-unknown"')
    expect(html).toContain('data-memo-color="red"')
  })

  it('B-1: extracts memo embedded inside a markdown table row', () => {
    const markdown = `| Header 1 | Header 2 |
|----------|----------|
| cell text <!-- USER_MEMO id="tm1" color="red" status="open" : table fix --> | other |
| normal | row |`

    const html = convertMemosToHtml(markdown)

    // Memo should be extracted from the table row and converted to memo-block HTML
    expect(html).toContain('data-memo-id="tm1"')
    expect(html).toContain('data-memo-color="red"')
    // The table row should no longer contain the memo comment
    expect(html).not.toContain('| cell text <!-- USER_MEMO')
  })
})
