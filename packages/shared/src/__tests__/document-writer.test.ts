import { describe, it, expect } from 'vitest'
import { splitDocument, mergeDocument, getAnnotationCounts } from '../index'

describe('document-writer — splitDocument and mergeDocument', () => {
  it('parses annotated markdown with v0.3 memo', () => {
    const input = `# Test Document

Some content here.
<!-- USER_MEMO id="m1" color="red" status="open" : Fix this typo -->

More content.`

    const parts = splitDocument(input)
    
    expect(parts.memos).toHaveLength(1)
    expect(parts.memos[0].id).toBe('m1')
    expect(parts.memos[0].color).toBe('red')
    expect(parts.memos[0].status).toBe('open')
    expect(parts.memos[0].text).toBe('Fix this typo')
  })

  it('roundtrip: mergeDocument(splitDocument(input)) produces equivalent output', () => {
    const input = `# Test Document

Some content here.
<!-- USER_MEMO id="m1" color="red" status="open" : Fix this typo -->

More content.`

    const parts = splitDocument(input)
    const output = mergeDocument(parts)
    
    expect(output).toContain('USER_MEMO')
    expect(output).toContain('m1')
    expect(output).toContain('Fix this typo')
  })

  it('handles empty input', () => {
    const parts = splitDocument('')

    expect(parts.frontmatter).toBe('')
    expect(parts.body).toBe('')
    expect(parts.memos).toEqual([])
    expect(parts.gates).toEqual([])
    expect(parts.checkpoints).toEqual([])
    expect(parts.cursor).toBeNull()
  })

  it('anchor drift: repeated split/merge cycles do not shift memo position', () => {
    // Create a document with a memo anchored to "Line B"
    const input = `# Title

Line A
Line B
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix this"
  anchorText="Line B"
  anchor="L4|deadbeef"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->
Line C`

    // First cycle: split → merge (anchor should update to correct hash)
    const parts1 = splitDocument(input)
    const output1 = mergeDocument(parts1)

    // Second cycle: split the output → check anchor is stable
    const parts2 = splitDocument(output1)
    const anchor2 = parts2.memos[0].anchor

    // Third cycle
    const output2 = mergeDocument(parts2)
    const parts3 = splitDocument(output2)
    const anchor3 = parts3.memos[0].anchor

    // Anchor should be identical between cycles 2 and 3 (no drift)
    expect(anchor3).toBe(anchor2)
    // Memo should still be associated with "Line B"
    expect(parts3.memos[0].anchorText).toBe('Line B')
  })

  it('anchor drift: memo re-anchors correctly when lines are inserted above', () => {
    const input = `# Title

Line A
Line B
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix this"
  anchorText="Line B"
  anchor="L4|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->
Line C`

    // First cycle to establish correct anchor
    const parts1 = splitDocument(input)
    const output1 = mergeDocument(parts1)
    const parts2 = splitDocument(output1)

    // Now insert a line above "Line B" in the body
    parts2.body = parts2.body.replace('Line A\nLine B', 'Line A\nNew line inserted\nLine B')
    const output2 = mergeDocument(parts2)

    // Split again — memo should have found "Line B" via hash
    const parts3 = splitDocument(output2)
    expect(parts3.memos[0].anchorText).toBe('Line B')
    // Body should contain all lines
    expect(parts3.body).toContain('New line inserted')
    expect(parts3.body).toContain('Line B')
  })
})

describe('getAnnotationCounts — no double-counting', () => {
  it('does not double-count highlights that have both USER_MEMO and <mark> tags', () => {
    const input = `# Test

<mark style="background-color: #fef08a">highlighted text</mark>
<!-- USER_MEMO
  id="m1"
  type="highlight"
  status="open"
  owner="human"
  source="generic"
  color="yellow"
  text="Important"
  anchorText="highlighted text"
  anchor="L3|abcd1234"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->

<mark style="background-color: #fca5a5">fix this</mark>
<!-- USER_MEMO
  id="m2"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Needs fix"
  anchorText="fix this"
  anchor="L5|abcd5678"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->`

    const counts = getAnnotationCounts(input)
    // Should count each annotation exactly once
    expect(counts.highlights).toBe(1)
    expect(counts.fixes).toBe(1)
    expect(counts.questions).toBe(0)
  })

  it('counts only USER_MEMO annotations, not raw ==text== marks', () => {
    const input = `# Test

==some highlighted text==
<!-- USER_MEMO
  id="m1"
  type="highlight"
  status="open"
  owner="human"
  source="generic"
  color="yellow"
  text="Note"
  anchorText="some highlighted text"
  anchor="L3|abcd1234"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->`

    const counts = getAnnotationCounts(input)
    expect(counts.highlights).toBe(1) // not 2
  })
})
