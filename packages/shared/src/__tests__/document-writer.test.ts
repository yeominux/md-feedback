import { describe, it, expect } from 'vitest'
import { splitDocument, mergeDocument, getAnnotationCounts, findMemoAnchorLine } from '../index'
import type { MemoV2 } from '../index'

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

  it('recovers missing fix/question memos from HIGHLIGHT_MARK metadata', () => {
    const input = `# Title

Anchor line
<!-- HIGHLIGHT_MARK color="#fca5a5" text="wrong word" anchor="Anchor line" -->
<!-- HIGHLIGHT_MARK color="#93c5fd" text="why this?" anchor="Anchor line" -->`

    const parts = splitDocument(input)
    const recovered = parts.memos.filter(m => m.source === 'recovered-highlight')

    expect(recovered).toHaveLength(2)
    expect(recovered.some(m => m.color === 'red' && m.type === 'fix')).toBe(true)
    expect(recovered.some(m => m.color === 'blue' && m.type === 'question')).toBe(true)
  })

  it('does not create duplicate recovered memos when explicit memo exists', () => {
    const input = `# Title

Anchor line
<!-- USER_MEMO id="m1" color="red" status="open" : Existing memo -->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="wrong word" anchor="Anchor line" -->`

    const parts = splitDocument(input)
    const redMemos = parts.memos.filter(m => m.color === 'red')

    expect(redMemos).toHaveLength(1)
    expect(redMemos[0].id).toBe('m1')
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

describe('findMemoAnchorLine — line-number fallback', () => {
  it('returns clamped line number when hash and anchorText are both stale', () => {
    const lines = ['# Title', '', 'Line A', 'Line B', 'Line C']
    const memo: MemoV2 = {
      id: 'm1',
      type: 'fix',
      status: 'open',
      owner: 'human',
      source: 'generic',
      color: 'red',
      text: 'Fix this',
      anchorText: 'NONEXISTENT TEXT',
      anchor: 'L4|ffffffff', // wrong hash, but line number L4 is valid
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    // Should fallback to line number (L4 → index 3) instead of returning -1
    expect(findMemoAnchorLine(lines, memo)).toBe(3)
  })

  it('clamps to last line when line number exceeds body length', () => {
    const lines = ['# Title', 'Line A']
    const memo: MemoV2 = {
      id: 'm1',
      type: 'fix',
      status: 'open',
      owner: 'human',
      source: 'generic',
      color: 'red',
      text: 'Fix',
      anchorText: 'GONE',
      anchor: 'L99|ffffffff',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(findMemoAnchorLine(lines, memo)).toBe(1) // clamped to last line
  })

  it('still prefers hash match over line-number fallback', () => {
    const lines = ['# Title', '', 'Line A', 'Target line', 'Line C']
    // First get the correct hash for "Target line"
    const parts = splitDocument(`# Title

Line A
Target line
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix"
  anchorText="Target line"
  anchor="L4|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->
Line C`)
    // After parsing, anchor is refreshed with correct hash
    const correctAnchor = parts.memos[0].anchor
    const memo: MemoV2 = {
      ...parts.memos[0],
      anchor: correctAnchor,
    }
    // Hash match should find the correct line
    expect(findMemoAnchorLine(lines, memo)).toBe(3)
  })
})

describe('splitDocument — v0.4 anchor refresh', () => {
  it('refreshes stale anchor hash during v0.4 memo parsing', () => {
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

    const parts = splitDocument(input)
    // anchor should be refreshed to match current "Line B" hash, not stale "deadbeef"
    expect(parts.memos[0].anchor).not.toContain('deadbeef')
    expect(parts.memos[0].anchor).toMatch(/^L\d+\|[0-9a-f]{8}$/)
  })
})

describe('batch_apply text_replace — anchor stability', () => {
  it('memo does not drift to end-of-file after body text replacement', () => {
    // Simulate: create document, replace body text (makes hash stale),
    // then split/merge again — memo should stay near its anchor
    const input = `# Plan

## Section 1

Original text here.
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="agent"
  source="mcp"
  color="red"
  text="Fix the wording"
  anchorText="Original text here."
  anchor="L5|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->

## Section 2

Other content.`

    // First cycle to establish correct anchor
    const parts1 = splitDocument(input)
    const output1 = mergeDocument(parts1)

    // Second cycle: simulate text_replace changing anchor text
    const parts2 = splitDocument(output1)
    parts2.body = parts2.body.replace('Original text here.', 'Updated text here.')
    // Also update anchorText (as batch_apply now does)
    for (const m of parts2.memos) {
      if (m.anchorText && m.anchorText.includes('Original text here.')) {
        m.anchorText = m.anchorText.replace('Original text here.', 'Updated text here.')
      }
    }
    const output2 = mergeDocument(parts2)

    // Verify memo is placed near "Updated text here." not at end-of-file
    const lines = output2.split('\n')
    const updatedTextIdx = lines.findIndex(l => l.includes('Updated text here.'))
    const memoIdx = lines.findIndex(l => l.includes('USER_MEMO'))
    expect(memoIdx).toBeGreaterThan(updatedTextIdx)
    // Memo should appear before Section 2, not at end
    const section2Idx = lines.findIndex(l => l.includes('## Section 2'))
    expect(memoIdx).toBeLessThan(section2Idx)
  })

  it('roundtrip after text_replace: REVIEW_RESPONSE stays near anchor', () => {
    const input = `# Plan

Target line.
<!-- USER_MEMO
  id="q1"
  type="question"
  status="needs_review"
  owner="human"
  source="generic"
  color="blue"
  text="Clarify this"
  anchorText="Target line."
  anchor="L3|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->
<!-- REVIEW_RESPONSE to="q1" -->
AI answer here.
<!-- /REVIEW_RESPONSE -->

## Other section

More content.`

    // Parse, replace text, and re-merge
    const parts = splitDocument(input)
    parts.body = parts.body.replace('Target line.', 'Modified target line.')
    for (const m of parts.memos) {
      if (m.anchorText?.includes('Target line.')) {
        m.anchorText = m.anchorText.replace('Target line.', 'Modified target line.')
      }
    }
    const output = mergeDocument(parts)

    // REVIEW_RESPONSE should follow the modified target line, before "Other section"
    const lines = output.split('\n')
    const targetIdx = lines.findIndex(l => l.includes('Modified target line.'))
    const respOpenIdx = lines.findIndex(l => l.includes('REVIEW_RESPONSE to="q1"'))
    const respCloseIdx = lines.findIndex(l => l.includes('/REVIEW_RESPONSE'))
    const otherSectionIdx = lines.findIndex(l => l.includes('## Other section'))

    expect(targetIdx).toBeGreaterThanOrEqual(0)
    expect(respOpenIdx).toBeGreaterThan(targetIdx)
    expect(respCloseIdx).toBeGreaterThan(respOpenIdx)
    expect(otherSectionIdx).toBeGreaterThan(respCloseIdx)
  })
})
