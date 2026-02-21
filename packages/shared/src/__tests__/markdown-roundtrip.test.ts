import { describe, it, expect } from 'vitest'
import { convertMemosToHtml, extractMemos } from '../markdown-roundtrip'
import { splitDocument, mergeDocument, escAttrValue, unescAttrValue } from '../index'

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

  it('B-2: extracts v0.3 memo on a blockquote line', () => {
    const markdown = `> Some quote text
> <!-- USER_MEMO id="bq1" color="red" status="open" : fix blockquote -->
> More quote text`

    const html = convertMemosToHtml(markdown)

    expect(html).toContain('data-memo-id="bq1"')
    expect(html).toContain('data-memo-color="red"')
  })

  it('B-2: extracts v0.4 multi-line memo with blockquote prefixes', () => {
    const markdown = `> Some quote text
> <!-- USER_MEMO
>   id="bq2"
>   color="blue"
>   status="open"
>   text="question in blockquote"
> -->
> More quote text`

    const html = convertMemosToHtml(markdown)

    // The memo should be extracted despite > prefixes on every line
    expect(html).toContain('data-memo-id="bq2"')
    expect(html).toContain('data-memo-color="blue"')
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

describe('encoding roundtrip — escAttrValue / unescAttrValue', () => {
  it('escapes and unescapes double quotes', () => {
    const original = 'Use "strict mode" here'
    expect(unescAttrValue(escAttrValue(original))).toBe(original)
  })

  it('escapes and unescapes ampersands', () => {
    const original = 'A & B & C'
    expect(unescAttrValue(escAttrValue(original))).toBe(original)
  })

  it('escapes and unescapes comment close -->', () => {
    const original = 'close tag --> and more'
    expect(unescAttrValue(escAttrValue(original))).toBe(original)
  })

  it('escapes and unescapes newlines', () => {
    const original = 'line 1\nline 2\nline 3'
    expect(unescAttrValue(escAttrValue(original))).toBe(original)
  })

  it('handles all special chars combined', () => {
    const original = 'Fix "this & that" --> done\nNext line'
    expect(unescAttrValue(escAttrValue(original))).toBe(original)
  })
})

describe('encoding roundtrip — v0.4 memo text survives splitDocument → mergeDocument', () => {
  it('memo text with double quotes survives roundtrip', () => {
    const doc = `# Test

Content here.
<!-- USER_MEMO
  id="enc1"
  type="fix"
  status="open"
  owner="human"
  source="vscode"
  color="red"
  text="Use &quot;strict mode&quot; here"
  anchorText="Content here."
  anchor="L3|00000000"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->`
    const parts = splitDocument(doc)
    expect(parts.memos[0].text).toBe('Use "strict mode" here')

    const merged = mergeDocument(parts)
    const parts2 = splitDocument(merged)
    expect(parts2.memos[0].text).toBe('Use "strict mode" here')
  })

  it('memo text with ampersands survives roundtrip', () => {
    const doc = `# Test

Content here.
<!-- USER_MEMO
  id="enc2"
  type="fix"
  status="open"
  owner="human"
  source="vscode"
  color="red"
  text="A &amp; B &amp; C"
  anchorText="Content here."
  anchor="L3|00000000"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->`
    const parts = splitDocument(doc)
    expect(parts.memos[0].text).toBe('A & B & C')

    const merged = mergeDocument(parts)
    const parts2 = splitDocument(merged)
    expect(parts2.memos[0].text).toBe('A & B & C')
  })

  it('memo text with comment close --> survives roundtrip', () => {
    const doc = `# Test

Content here.
<!-- USER_MEMO
  id="enc3"
  type="fix"
  status="open"
  owner="human"
  source="vscode"
  color="red"
  text="close tag --&#62; and more"
  anchorText="Content here."
  anchor="L3|00000000"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->`
    const parts = splitDocument(doc)
    expect(parts.memos[0].text).toBe('close tag --> and more')

    const merged = mergeDocument(parts)
    const parts2 = splitDocument(merged)
    expect(parts2.memos[0].text).toBe('close tag --> and more')
  })

  it('no double-encoding across 3 roundtrips', () => {
    const doc = `# Test

Content here.
<!-- USER_MEMO
  id="enc4"
  type="fix"
  status="open"
  owner="human"
  source="vscode"
  color="red"
  text="Fix &quot;this &amp; that&quot; --&#62; done&#10;Next line"
  anchorText="Content here."
  anchor="L3|00000000"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->`
    const expected = 'Fix "this & that" --> done\nNext line'

    // Round 1
    const parts1 = splitDocument(doc)
    expect(parts1.memos[0].text).toBe(expected)
    const merged1 = mergeDocument(parts1)

    // Round 2
    const parts2 = splitDocument(merged1)
    expect(parts2.memos[0].text).toBe(expected)
    const merged2 = mergeDocument(parts2)

    // Round 3
    const parts3 = splitDocument(merged2)
    expect(parts3.memos[0].text).toBe(expected)

    // Verify no double-encoding: merged output should not contain &amp;amp;
    expect(merged2).not.toContain('&amp;amp;')
    expect(merged2).not.toContain('&amp;quot;')
    expect(merged2).not.toContain('&amp;#')
  })
})

describe('encoding roundtrip — convertMemosToHtml preserves v0.4 fields', () => {
  it('v0.4 memo text with special chars converts to HTML without corruption', () => {
    const doc = `# Test

Content here.
<!-- USER_MEMO
  id="html1"
  type="fix"
  status="open"
  owner="human"
  source="vscode"
  color="red"
  text="Fix &quot;this &amp; that&quot;"
  anchorText="Content here."
  anchor="L3|00000000"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->`
    const html = convertMemosToHtml(doc)
    expect(html).toContain('data-memo-id="html1"')
    // Text should be HTML-attr-escaped (& → &amp; " → &quot;)
    expect(html).toContain('data-memo-text=')
  })

  it('v0.4 type, owner, source fields pass through to HTML attributes', () => {
    const doc = `# Test

Content here.
<!-- USER_MEMO
  id="field1"
  type="question"
  status="open"
  owner="reviewer"
  source="mcp"
  color="blue"
  text="Is this correct?"
  anchorText="Content here."
  anchor="L3|00000000"
  createdAt="2026-01-15T10:30:00.000Z"
  updatedAt="2026-01-15T10:30:00.000Z"
-->`
    const html = convertMemosToHtml(doc)
    expect(html).toContain('data-memo-id="field1"')
    expect(html).toContain('data-memo-type="question"')
    expect(html).toContain('data-memo-owner="reviewer"')
    expect(html).toContain('data-memo-source="mcp"')
    expect(html).toContain('data-memo-created="2026-01-15T10:30:00.000Z"')
    expect(html).toContain('data-memo-updated="2026-01-15T10:30:00.000Z"')
  })
})
