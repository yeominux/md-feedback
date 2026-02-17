import { describe, it, expect } from 'vitest'
import { extractHighlightMarks, stripHighlightMarks, convertMemosToHtml } from '../markdown-roundtrip'

describe('highlight marks — extractHighlightMarks', () => {
  it('extracts a single highlight mark', () => {
    const md = `# Title

Some text here.

<!-- HIGHLIGHT_MARK color="#fef08a" text="Some text" anchor="Some text here." -->`

    const marks = extractHighlightMarks(md)
    expect(marks).toHaveLength(1)
    expect(marks[0]).toEqual({
      color: '#fef08a',
      text: 'Some text',
      anchor: 'Some text here.',
    })
  })

  it('extracts multiple highlight marks', () => {
    const md = `# Title

Paragraph one.
Paragraph two.

<!-- HIGHLIGHT_MARK color="#fef08a" text="one" anchor="Paragraph one." -->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="two" anchor="Paragraph two." -->`

    const marks = extractHighlightMarks(md)
    expect(marks).toHaveLength(2)
    expect(marks[0].color).toBe('#fef08a')
    expect(marks[0].text).toBe('one')
    expect(marks[1].color).toBe('#fca5a5')
    expect(marks[1].text).toBe('two')
  })

  it('returns empty array when no marks present', () => {
    const md = `# Title\n\nPlain text.`
    expect(extractHighlightMarks(md)).toEqual([])
  })

  it('decodes HTML entities in text and anchor', () => {
    const md = `<!-- HIGHLIGHT_MARK color="#fef08a" text="a &amp; b &lt;c&gt;" anchor="line with &quot;quotes&quot;" -->`
    const marks = extractHighlightMarks(md)
    expect(marks).toHaveLength(1)
    expect(marks[0].text).toBe('a & b <c>')
    expect(marks[0].anchor).toBe('line with "quotes"')
  })
})

describe('highlight marks — stripHighlightMarks', () => {
  it('strips highlight mark comments from markdown', () => {
    const md = `# Title

Some text.

<!-- HIGHLIGHT_MARK color="#fef08a" text="Some" anchor="Some text." -->`

    const result = stripHighlightMarks(md)
    expect(result).toBe(`# Title

Some text.`)
  })

  it('strips multiple marks', () => {
    const md = `Content here.

<!-- HIGHLIGHT_MARK color="#fef08a" text="a" anchor="b" -->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="c" anchor="d" -->`

    const result = stripHighlightMarks(md)
    expect(result).toBe('Content here.')
  })

  it('returns unchanged markdown when no marks', () => {
    const md = '# Title\n\nPlain text.'
    expect(stripHighlightMarks(md)).toBe(md)
  })
})

describe('highlight marks — convertMemosToHtml strips HIGHLIGHT_MARK', () => {
  it('does not pass HIGHLIGHT_MARK comments through to HTML', () => {
    const md = `# Title

Some text.

<!-- HIGHLIGHT_MARK color="#fef08a" text="Some" anchor="Some text." -->`

    const result = convertMemosToHtml(md)
    expect(result).not.toContain('HIGHLIGHT_MARK')
    expect(result).toContain('Some text.')
  })

  it('preserves memo blocks while stripping highlight marks', () => {
    const md = `# Title

Some text.
<!-- USER_MEMO id="m1" color="red" : Fix this -->

<!-- HIGHLIGHT_MARK color="#fca5a5" text="Some text" anchor="Some text." -->`

    const result = convertMemosToHtml(md)
    expect(result).not.toContain('HIGHLIGHT_MARK')
    expect(result).toContain('data-memo-id="m1"')
  })
})

describe('highlight marks — roundtrip', () => {
  it('extract → strip roundtrip preserves mark data', () => {
    const md = `# Doc

Hello world.

<!-- HIGHLIGHT_MARK color="#fef08a" text="Hello" anchor="Hello world." -->
<!-- HIGHLIGHT_MARK color="#93c5fd" text="world" anchor="Hello world." -->`

    const marks = extractHighlightMarks(md)
    const clean = stripHighlightMarks(md)

    expect(marks).toHaveLength(2)
    expect(clean).toBe('# Doc\n\nHello world.')
    expect(marks[0].text).toBe('Hello')
    expect(marks[1].text).toBe('world')
  })

  it('highlight marks inside table-containing documents', () => {
    const md = `| A | B |
| --- | --- |
| cell1 | cell2 |

<!-- HIGHLIGHT_MARK color="#fef08a" text="cell1" anchor="cell1" -->`

    const marks = extractHighlightMarks(md)
    expect(marks).toHaveLength(1)
    expect(marks[0].text).toBe('cell1')

    const clean = stripHighlightMarks(md)
    expect(clean).not.toContain('HIGHLIGHT_MARK')
    expect(clean).toContain('| cell1 | cell2 |')
  })

  it('highlight marks coexist with AI response blocks', () => {
    const md = `Some text.

<!-- REVIEW_RESPONSE to="m1" -->
AI says hello.
<!-- /REVIEW_RESPONSE -->

<!-- HIGHLIGHT_MARK color="#fca5a5" text="AI says" anchor="AI says hello." -->`

    const marks = extractHighlightMarks(md)
    expect(marks).toHaveLength(1)
    expect(marks[0].text).toBe('AI says')

    const clean = stripHighlightMarks(md)
    expect(clean).toContain('REVIEW_RESPONSE')
    expect(clean).not.toContain('HIGHLIGHT_MARK')
  })

  it('no backslash accumulation — special chars preserved', () => {
    const md = `<!-- HIGHLIGHT_MARK color="#fef08a" text="hello **bold** text" anchor="hello **bold** text in a paragraph" -->`

    const marks = extractHighlightMarks(md)
    expect(marks[0].text).toBe('hello **bold** text')

    // Simulate second roundtrip — text should remain identical
    const marks2 = extractHighlightMarks(md)
    expect(marks2[0].text).toBe(marks[0].text) // no extra backslashes
  })
})
