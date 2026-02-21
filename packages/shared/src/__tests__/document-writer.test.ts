import { describe, it, expect } from 'vitest'
import { splitDocument, mergeDocument, exportCleanBody, getAnnotationCounts, findMemoAnchorLine, findMemoAnchorLineWithConfidence, parseJsonWithBom, stripMarkdownFormatting, MIN_ANCHOR_TEXT_LENGTH } from '../index'
import type { MemoV2, DocumentParts } from '../index'

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

  it('does not create duplicate when memo anchorText has heading prefix but highlight mark does not', () => {
    const input = `# Title

### Step 3: Add session management
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="wontfix"
  owner="human"
  source="generic"
  color="red"
  text="remove"
  anchorText="### Step 3: Add session management"
  anchor="L3|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="Add" anchor="Step 3: Add session management" -->`

    const parts = splitDocument(input)
    const redMemos = parts.memos.filter(m => m.color === 'red')

    expect(redMemos).toHaveLength(1)
    expect(redMemos[0].id).toBe('m1')
  })

  it('recovers distinct memos when anchors share long prefix', () => {
    const shared = 'A'.repeat(40)
    const input = `# Title

${shared} one
${shared} two
<!-- HIGHLIGHT_MARK color="#93c5fd" text="first question" anchor="${shared} one" -->
<!-- HIGHLIGHT_MARK color="#93c5fd" text="second question" anchor="${shared} two" -->`

    const parts = splitDocument(input)
    const recoveredBlue = parts.memos.filter(
      m => m.source === 'recovered-highlight' && m.color === 'blue',
    )

    expect(recoveredBlue).toHaveLength(2)
    expect(new Set(recoveredBlue.map(m => m.anchorText)).size).toBe(2)
  })

  it('does not create false recovery when AI edits surrounding text (anchor drift)', () => {
    // Scenario: User creates memo on "Original text here", AI edits the block
    // to "Modified text here". HIGHLIGHT_MARK anchor drifts but markText matches.
    const input = `# Title

Modified text here
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix this"
  anchorText="Original text here"
  anchor="L3|stale_hash"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="Fix this" anchor="Modified text here" -->`

    const parts = splitDocument(input)
    const recovered = parts.memos.filter(m => m.source === 'recovered-highlight')

    // markText "Fix this" matches memo text "Fix this" → no false recovery
    expect(recovered).toHaveLength(0)
    expect(parts.memos).toHaveLength(1)
    expect(parts.memos[0].id).toBe('m1')
  })

  it('refreshes anchorText on parse when anchor line is found', () => {
    const input = `# Title

Current line content
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix this"
  anchorText="Current line content"
  anchor="L3|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->`

    const parts = splitDocument(input)
    // anchorText should be refreshed to current body line content
    expect(parts.memos[0].anchorText).toBe('Current line content')

    // Now simulate AI editing the line — anchorText should update on next parse
    const merged = mergeDocument(parts)
    const edited = merged.replace('Current line content', 'AI edited this line')
    const parts2 = splitDocument(edited)

    // findMemoAnchorLine should find the line via anchorText substring match
    // and refresh anchorText to the new content
    expect(parts2.memos[0].anchorText).toBe('AI edited this line')
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

describe('splitDocument — memo ID dedup', () => {
  it('deduplicates v0.3 memos with the same ID, keeping the first occurrence', () => {
    const input = `# Title

Correct anchor line
<!-- USER_MEMO id="m1" color="red" status="done" : Fix this -->

More content

Wrong anchor line (EOF duplicate)
<!-- USER_MEMO id="m1" color="red" status="open" : Fix this -->`

    const parts = splitDocument(input)
    expect(parts.memos).toHaveLength(1)
    expect(parts.memos[0].id).toBe('m1')
    // First occurrence has status="done" and correct anchor
    expect(parts.memos[0].status).toBe('done')
    expect(parts.memos[0].anchorText).toBe('Correct anchor line')
  })

  it('deduplicates v0.4 memos with the same ID', () => {
    const input = `# Title

First anchor
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="needs_review"
  owner="human"
  source="generic"
  color="red"
  text="Fix this"
  anchorText="First anchor"
  anchor="L3|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->

Last line
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix this"
  anchorText="Last line"
  anchor="L5|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->`

    const parts = splitDocument(input)
    expect(parts.memos).toHaveLength(1)
    expect(parts.memos[0].status).toBe('needs_review')
  })

  it('deduplicates mixed v0.3 + v0.4 memos with the same ID', () => {
    const input = `# Title

Anchor line
<!-- USER_MEMO id="m1" color="red" status="done" : Fix this -->

<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix this"
  anchorText="Anchor line"
  anchor="L3|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->`

    const parts = splitDocument(input)
    expect(parts.memos).toHaveLength(1)
    expect(parts.memos[0].status).toBe('done')
  })
})

describe('splitDocument — v0.3 anchorText attribute', () => {
  it('parses anchorText from v0.3 memo comment', () => {
    const input = `# Title

Some content
<!-- USER_MEMO id="m1" color="red" status="open" anchorText="Some content" : Fix this -->`

    const parts = splitDocument(input)
    expect(parts.memos).toHaveLength(1)
    expect(parts.memos[0].anchorText).toBe('Some content')
  })

  it('falls back to findAnchorAbove when anchorText is absent in v0.3', () => {
    const input = `# Title

Fallback anchor line
<!-- USER_MEMO id="m1" color="red" status="open" : Fix this -->`

    const parts = splitDocument(input)
    expect(parts.memos).toHaveLength(1)
    expect(parts.memos[0].anchorText).toBe('Fallback anchor line')
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

  it('when anchorText has multiple matches, prefers the one closest to anchor line number', () => {
    const lines = [
      '# Title',
      'Repeated anchor line',
      'Other content',
      'Repeated anchor line',
      'Tail',
    ]
    const memo: MemoV2 = {
      id: 'm_dup',
      type: 'fix',
      status: 'open',
      owner: 'human',
      source: 'generic',
      color: 'red',
      text: 'Fix duplicated anchor',
      anchorText: 'Repeated anchor line',
      anchor: 'L4|ffffffff', // hash stale, but line number indicates second occurrence
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    expect(findMemoAnchorLine(lines, memo)).toBe(3)
  })

  it('pins to last body line when anchor and anchorText are both missing', () => {
    const lines = ['Line A', 'Line B', 'Line C']
    const memo: MemoV2 = {
      id: 'm_missing',
      type: 'fix',
      status: 'open',
      owner: 'human',
      source: 'generic',
      color: 'red',
      text: 'Fix missing anchor metadata',
      anchorText: '',
      anchor: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    expect(findMemoAnchorLine(lines, memo)).toBe(2)
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

  it('keeps per-memo anchors when all metadata blocks are grouped at EOF', () => {
    const input = `# Report

Intro
First anchor line
Middle
Second anchor line

<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix first"
  anchorText="First anchor line"
  anchor="L999|deadbeef"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->
<!-- USER_MEMO
  id="m2"
  type="question"
  status="open"
  owner="human"
  source="generic"
  color="blue"
  text="Ask second"
  anchorText="Second anchor line"
  anchor="L998|deadbeef"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->
<!-- GATE
  id="gate_1"
  type="custom"
  status="blocked"
  blockedBy="m1,m2"
  canProceedIf="All clear"
  doneDefinition="Both addressed"
-->
<!-- PLAN_CURSOR
  taskId="task_1"
  step="1/1"
  nextAction="review"
  lastSeenHash="abc12345"
  updatedAt="2026-01-01T00:00:00.000Z"
-->`

    const parts = splitDocument(input)
    const merged = mergeDocument(parts)
    const lines = merged.split('\n')

    const firstAnchorIdx = lines.findIndex(l => l.includes('First anchor line'))
    const secondAnchorIdx = lines.findIndex(l => l.includes('Second anchor line'))
    const memo1Idx = lines.findIndex(l => l.includes('id="m1"'))
    const memo2Idx = lines.findIndex(l => l.includes('id="m2"'))
    const cursorIdx = lines.findIndex(l => l.includes('PLAN_CURSOR'))

    expect(memo1Idx).toBeGreaterThan(firstAnchorIdx)
    expect(memo1Idx).toBeLessThan(secondAnchorIdx)
    expect(memo2Idx).toBeGreaterThan(secondAnchorIdx)
    expect(memo2Idx).toBeLessThan(cursorIdx)
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

describe('rejectReason — roundtrip', () => {
  it('preserves rejectReason through split/merge cycle', () => {
    const input = `# Title

Some content
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="wontfix"
  owner="human"
  source="generic"
  color="red"
  text="Fix this"
  anchorText="Some content"
  anchor="L3|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
  rejectReason="Not applicable to this scope"
-->`

    const parts = splitDocument(input)
    expect(parts.memos).toHaveLength(1)
    expect(parts.memos[0].rejectReason).toBe('Not applicable to this scope')

    const output = mergeDocument(parts)
    expect(output).toContain('rejectReason="Not applicable to this scope"')

    // Second cycle
    const parts2 = splitDocument(output)
    expect(parts2.memos[0].rejectReason).toBe('Not applicable to this scope')
  })

  it('omits rejectReason attribute when not set', () => {
    const input = `# Title

Some content
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix this"
  anchorText="Some content"
  anchor="L3|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->`

    const parts = splitDocument(input)
    expect(parts.memos[0].rejectReason).toBeUndefined()

    const output = mergeDocument(parts)
    expect(output).not.toContain('rejectReason')
  })

  it('preserves backslashes and special text in memo content across cycles', () => {
    const input = `# Title

Anchor line
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Path C:\\todo\\report-clean.md and network \\\\server\\share and marker -->"
  anchorText="Anchor line"
  anchor="L3|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->`

    const parts1 = splitDocument(input)
    const output1 = mergeDocument(parts1)
    const parts2 = splitDocument(output1)
    const output2 = mergeDocument(parts2)

    expect(parts2.memos[0].text).toBe('Path C:\\todo\\report-clean.md and network \\\\server\\share and marker -->')
    expect(output2).toContain('Path C:\\todo\\report-clean.md and network \\\\server\\share and marker --&#62;')
  })
})

describe('mergeDocument — unanchored safety fallback', () => {
  it('places orphaned memo at body end instead of body start', () => {
    const input = `# Title

Line A
Line B
Line C
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix this"
  anchorText="Line B"
  anchor="L3|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->`

    const parts = splitDocument(input)
    parts.memos[0].anchor = ''
    parts.memos[0].anchorText = ''
    const output = mergeDocument(parts)
    const lines = output.split('\n')
    const lineCIdx = lines.findIndex(l => l.trim() === 'Line C')
    const memoIdx = lines.findIndex(l => l.includes('id="m1"'))

    expect(lineCIdx).toBeGreaterThanOrEqual(0)
    expect(memoIdx).toBeGreaterThanOrEqual(0)
    expect(memoIdx).toBeGreaterThan(lineCIdx)
  })
})

describe('stripMarkdownFormatting', () => {
  // Block-level prefixes
  it('strips blockquote prefix', () => {
    expect(stripMarkdownFormatting('> Some text')).toBe('Some text')
  })

  it('strips nested blockquote prefix', () => {
    expect(stripMarkdownFormatting('> > Deep quote')).toBe('Deep quote')
  })

  it('strips heading prefix', () => {
    expect(stripMarkdownFormatting('### Section title')).toBe('Section title')
  })

  it('strips unordered list marker (dash)', () => {
    expect(stripMarkdownFormatting('- List item')).toBe('List item')
  })

  it('strips unordered list marker (asterisk)', () => {
    expect(stripMarkdownFormatting('* List item')).toBe('List item')
  })

  it('strips ordered list marker', () => {
    expect(stripMarkdownFormatting('1. First item')).toBe('First item')
  })

  it('strips task list marker (unchecked)', () => {
    expect(stripMarkdownFormatting('- [ ] Todo item')).toBe('Todo item')
  })

  it('strips task list marker (checked)', () => {
    expect(stripMarkdownFormatting('- [x] Done item')).toBe('Done item')
  })

  // Inline formatting
  it('strips bold markers', () => {
    expect(stripMarkdownFormatting('**bold text**')).toBe('bold text')
  })

  it('strips italic markers (asterisk)', () => {
    expect(stripMarkdownFormatting('*italic text*')).toBe('italic text')
  })

  it('strips underscore bold', () => {
    expect(stripMarkdownFormatting('__bold text__')).toBe('bold text')
  })

  it('strips underscore italic', () => {
    expect(stripMarkdownFormatting('_italic text_')).toBe('italic text')
  })

  it('strips bold+italic (***)', () => {
    expect(stripMarkdownFormatting('***bold italic***')).toBe('bold italic')
  })

  it('strips strikethrough', () => {
    expect(stripMarkdownFormatting('~~deleted text~~')).toBe('deleted text')
  })

  it('strips highlight marks (==)', () => {
    expect(stripMarkdownFormatting('==highlighted text==')).toBe('highlighted text')
  })

  it('strips code spans', () => {
    expect(stripMarkdownFormatting('Use `console.log` here')).toBe('Use console.log here')
  })

  it('strips double backtick code spans', () => {
    expect(stripMarkdownFormatting('Use ``code here`` please')).toBe('Use code here please')
  })

  // Links and images
  it('strips markdown links, keeps text', () => {
    expect(stripMarkdownFormatting('[Click here](https://example.com)')).toBe('Click here')
  })

  it('strips markdown images, keeps alt text', () => {
    expect(stripMarkdownFormatting('![Alt text](image.png)')).toBe('Alt text')
  })

  it('strips reference links, keeps text', () => {
    expect(stripMarkdownFormatting('[Click here][ref1]')).toBe('Click here')
  })

  // HTML tags
  it('strips inline HTML tags', () => {
    expect(stripMarkdownFormatting('<strong>bold</strong> and <em>italic</em>')).toBe('bold and italic')
  })

  it('strips <mark> tags', () => {
    expect(stripMarkdownFormatting('<mark>highlighted</mark> text')).toBe('highlighted text')
  })

  it('strips <del> and <u> tags', () => {
    expect(stripMarkdownFormatting('<del>deleted</del> and <u>underlined</u>')).toBe('deleted and underlined')
  })

  it('strips <a> tags with attributes', () => {
    expect(stripMarkdownFormatting('<a href="url">link text</a>')).toBe('link text')
  })

  it('strips <code> tags', () => {
    expect(stripMarkdownFormatting('<code>code</code> here')).toBe('code here')
  })

  // Backslash escapes
  it('unescapes markdown brackets', () => {
    expect(stripMarkdownFormatting('\\[!CAUTION\\] Warning')).toBe('[!CAUTION] Warning')
  })

  it('unescapes markdown asterisks', () => {
    expect(stripMarkdownFormatting('2 \\* 3 = 6')).toBe('2 * 3 = 6')
  })

  it('unescapes markdown hash', () => {
    expect(stripMarkdownFormatting('\\# Not a heading')).toBe('# Not a heading')
  })

  it('unescapes markdown pipe', () => {
    expect(stripMarkdownFormatting('A \\| B')).toBe('A | B')
  })

  it('unescapes backslash', () => {
    expect(stripMarkdownFormatting('path\\\\to\\\\file')).toBe('path\\to\\file')
  })

  // Combined / real-world cases
  it('handles combined formatting: blockquote + escaped brackets + bold', () => {
    const input = '> \\[!CAUTION\\] **졸업프로젝트(1) 수강 가능 여부 확인**'
    const stripped = stripMarkdownFormatting(input)
    expect(stripped).toBe('[!CAUTION] 졸업프로젝트(1) 수강 가능 여부 확인')
  })

  it('handles callout variants: [!NOTE], [!WARNING], [!TIP], [!IMPORTANT]', () => {
    expect(stripMarkdownFormatting('> \\[!NOTE\\] **Read this**')).toBe('[!NOTE] Read this')
    expect(stripMarkdownFormatting('> \\[!WARNING\\] *Be careful*')).toBe('[!WARNING] Be careful')
    expect(stripMarkdownFormatting('> \\[!TIP\\] Helpful tip')).toBe('[!TIP] Helpful tip')
    expect(stripMarkdownFormatting('> \\[!IMPORTANT\\] **Critical**')).toBe('[!IMPORTANT] Critical')
  })

  it('handles heading with bold content', () => {
    expect(stripMarkdownFormatting('### **Bold Heading**')).toBe('Bold Heading')
  })

  it('handles list item with link', () => {
    expect(stripMarkdownFormatting('- [Click here](https://example.com) for details')).toBe('Click here for details')
  })

  it('handles blockquote with code span', () => {
    expect(stripMarkdownFormatting('> Use `npm install` to install')).toBe('Use npm install to install')
  })

  it('preserves plain text unchanged', () => {
    expect(stripMarkdownFormatting('Just normal text here')).toBe('Just normal text here')
  })

  it('preserves parentheses and numbers', () => {
    expect(stripMarkdownFormatting('졸업프로젝트(1) (구 DCS(4))')).toBe('졸업프로젝트(1) (구 DCS(4))')
  })

  // Footnotes
  it('strips footnote references', () => {
    expect(stripMarkdownFormatting('Some text[^1] with footnote')).toBe('Some text with footnote')
  })

  it('strips named footnote references', () => {
    expect(stripMarkdownFormatting('Text[^note] here')).toBe('Text here')
  })

  it('strips multiple footnote references', () => {
    expect(stripMarkdownFormatting('A[^1] and B[^2]')).toBe('A and B')
  })

  // Inline math
  it('strips inline math delimiters', () => {
    expect(stripMarkdownFormatting('formula $x + 1$ here')).toBe('formula x + 1 here')
  })

  it('preserves display math ($$) untouched', () => {
    expect(stripMarkdownFormatting('$$E = mc^2$$')).toBe('$$E = mc^2$$')
  })

  it('strips multiple inline math spans', () => {
    expect(stripMarkdownFormatting('where $a$ and $b$ are constants')).toBe('where a and b are constants')
  })

  // Table pipes
  it('strips leading table pipe', () => {
    expect(stripMarkdownFormatting('| Cell content')).toBe('Cell content')
  })

  it('strips trailing table pipe', () => {
    expect(stripMarkdownFormatting('Cell content |')).toBe('Cell content')
  })

  it('strips both leading and trailing pipes', () => {
    expect(stripMarkdownFormatting('| Cell content |')).toBe('Cell content')
  })

  // Combined: footnotes + formatting
  it('handles footnote in bold text', () => {
    expect(stripMarkdownFormatting('**Important claim**[^1]')).toBe('Important claim')
  })

  // Combined: math + formatting
  it('handles inline math in heading', () => {
    expect(stripMarkdownFormatting('### Formula: $x^2$')).toBe('Formula: x^2')
  })

  // Combined: table + formatting
  it('handles table cell with bold content', () => {
    expect(stripMarkdownFormatting('| **Bold cell** |')).toBe('Bold cell')
  })

  // Escaped dollar sign
  it('unescapes dollar sign', () => {
    expect(stripMarkdownFormatting('Price is \\$100')).toBe('Price is $100')
  })
})

describe('findMemoAnchorLine — markdown-formatted body lines', () => {
  it('matches anchorText against escaped callout body line', () => {
    const lines = [
      '# Title',
      '',
      '> \\[!CAUTION\\] **졸업프로젝트(1) (구 DCS(4)) 수강 가능 여부를 반드시 확인할 것**',
      '>',
      '> Some details here.',
    ]
    const memo: MemoV2 = {
      id: 'm_callout',
      type: 'fix',
      status: 'open',
      owner: 'human',
      source: 'recovered-highlight',
      color: 'red',
      text: 'Fix callout issue',
      anchorText: '[!CAUTION] 졸업프로젝트(1) (구 DCS(4)) 수강 가능 여부를 반드시 확인할 것',
      anchor: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(findMemoAnchorLine(lines, memo)).toBe(2)
  })

  it('matches anchorText with bold markers in body line', () => {
    const lines = [
      '# Title',
      '**Important text here**',
      'Normal text',
    ]
    const memo: MemoV2 = {
      id: 'm_bold',
      type: 'fix',
      status: 'open',
      owner: 'human',
      source: 'generic',
      color: 'red',
      text: 'Fix this',
      anchorText: 'Important text here',
      anchor: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(findMemoAnchorLine(lines, memo)).toBe(1)
  })
})

describe('HIGHLIGHT_MARK recovery — escaped callout anchor', () => {
  it('recovers memo and anchors to callout line despite markdown escaping', () => {
    const input = `# Title

> \\[!CAUTION\\] **졸업프로젝트(1) 수강 가능 여부를 반드시 확인할 것**
>
> Some details.

Other content.
<!-- HIGHLIGHT_MARK color="#fca5a5" text="졸업프로젝트(1) 수강 가능 여부를 반드시 확인할 것" anchor="[!CAUTION] 졸업프로젝트(1) 수강 가능 여부를 반드시 확인할 것" -->`

    const parts = splitDocument(input)
    const recovered = parts.memos.filter(m => m.source === 'recovered-highlight')

    expect(recovered).toHaveLength(1)
    // Anchor should resolve to the callout line, not be empty
    expect(recovered[0].anchor).toMatch(/^L\d+\|[0-9a-f]{8}$/)
    // Anchor line should be line 3 (the callout line)
    expect(recovered[0].anchor).toMatch(/^L3\|/)

    // After merge, memo should appear near the callout, not at the end
    const merged = mergeDocument(parts)
    const lines = merged.split('\n')
    const calloutIdx = lines.findIndex(l => l.includes('CAUTION'))
    const memoIdx = lines.findIndex(l => l.includes('USER_MEMO'))
    expect(memoIdx).toBeGreaterThan(calloutIdx)
    expect(memoIdx).toBeLessThan(calloutIdx + 5)
  })
})

describe('block-structure preservation — memos in blockquotes/tables/callouts', () => {
  it('memo anchored inside blockquote is placed after blockquote ends', () => {
    const input = `# Title

> First quote line
> Second quote line
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix quote content"
  anchorText="First quote line"
  anchor="L3|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->

Other content.`

    const parts = splitDocument(input)
    const merged = mergeDocument(parts)
    const lines = merged.split('\n')

    // Blockquote lines should be contiguous (no memo between them)
    const q1 = lines.findIndex(l => l.includes('> First quote line'))
    const q2 = lines.findIndex(l => l.includes('> Second quote line'))
    expect(q2).toBe(q1 + 1) // consecutive, no gap

    // Memo should come after the entire blockquote
    const memoIdx = lines.findIndex(l => l.includes('USER_MEMO'))
    expect(memoIdx).toBeGreaterThan(q2)
  })

  it('memo anchored inside table is placed after table ends', () => {
    const input = `# Title

| Header 1 | Header 2 |
|----------|----------|
| cell A | data A |
| cell B | data B |
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix table data"
  anchorText="cell A"
  anchor="L5|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->

Other content.`

    const parts = splitDocument(input)
    const merged = mergeDocument(parts)
    const lines = merged.split('\n')

    // Table rows should be contiguous
    const headerIdx = lines.findIndex(l => l.includes('| Header 1'))
    const lastRowIdx = lines.findIndex(l => l.includes('| cell B'))
    // All table lines should be consecutive
    for (let i = headerIdx; i <= lastRowIdx; i++) {
      expect(lines[i]).toMatch(/^\s*\|/)
    }

    // Memo should come after the entire table
    const memoIdx = lines.findIndex(l => l.includes('USER_MEMO'))
    expect(memoIdx).toBeGreaterThan(lastRowIdx)
  })

  it('memo anchored inside callout is placed after callout ends', () => {
    const input = `# Title

> [!NOTE]
> This is important
> More details here

<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix callout"
  anchorText="This is important"
  anchor="L4|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->

Other content.`

    const parts = splitDocument(input)
    const merged = mergeDocument(parts)
    const lines = merged.split('\n')

    // All callout lines should be contiguous
    const noteIdx = lines.findIndex(l => l.includes('> [!NOTE]'))
    const detailsIdx = lines.findIndex(l => l.includes('> More details here'))
    for (let i = noteIdx; i <= detailsIdx; i++) {
      expect(lines[i]).toMatch(/^\s*>/)
    }

    // Memo should come after callout
    const memoIdx = lines.findIndex(l => l.includes('USER_MEMO'))
    expect(memoIdx).toBeGreaterThan(detailsIdx)
  })

  it('roundtrip preserves blockquote structure with memo', () => {
    const input = `# Title

> Line A
> Line B
> Line C
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix B"
  anchorText="Line B"
  anchor="L4|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->

Tail.`

    // Multiple roundtrips should keep blockquote intact
    const parts1 = splitDocument(input)
    const output1 = mergeDocument(parts1)
    const parts2 = splitDocument(output1)
    const output2 = mergeDocument(parts2)

    const lines = output2.split('\n')
    const lineA = lines.findIndex(l => l.includes('> Line A'))
    const lineC = lines.findIndex(l => l.includes('> Line C'))

    // Blockquote should be contiguous (3 lines: A, B, C)
    expect(lineC - lineA).toBe(2)

    // Memo should appear after Line C
    const memoIdx = lines.findIndex(l => l.includes('USER_MEMO'))
    expect(memoIdx).toBeGreaterThan(lineC)
  })

  it('multiple memos in same blockquote are both placed after block end', () => {
    const input = `# Title

> Line A
> Line B
> Line C
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix A"
  anchorText="Line A"
  anchor="L3|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->
<!-- USER_MEMO
  id="m2"
  type="question"
  status="open"
  owner="human"
  source="generic"
  color="blue"
  text="Ask B"
  anchorText="Line B"
  anchor="L4|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->

Tail.`

    const parts = splitDocument(input)
    expect(parts.memos).toHaveLength(2)

    const merged = mergeDocument(parts)
    const lines = merged.split('\n')

    // Blockquote lines should be contiguous
    const lineA = lines.findIndex(l => l.includes('> Line A'))
    const lineC = lines.findIndex(l => l.includes('> Line C'))
    expect(lineC - lineA).toBe(2)

    // Both memos should be after the blockquote
    const memo1Idx = lines.findIndex(l => l.includes('id="m1"'))
    const memo2Idx = lines.findIndex(l => l.includes('id="m2"'))
    expect(memo1Idx).toBeGreaterThan(lineC)
    expect(memo2Idx).toBeGreaterThan(lineC)
  })

  it('memo on normal line (not in block) still inserts right after anchor', () => {
    const input = `# Title

Normal line here.
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix it"
  anchorText="Normal line here."
  anchor="L3|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->

Other content.`

    const parts = splitDocument(input)
    const merged = mergeDocument(parts)
    const lines = merged.split('\n')

    const anchorIdx = lines.findIndex(l => l.includes('Normal line here.'))
    const memoIdx = lines.findIndex(l => l.includes('USER_MEMO'))

    // Memo should be right after its anchor (next line, allowing for the comment start)
    expect(memoIdx).toBe(anchorIdx + 1)
  })
})

describe('parseJsonWithBom', () => {
  it('parses normal JSON', () => {
    const result = parseJsonWithBom<{ a: number }>('{"a":1}')
    expect(result).toEqual({ a: 1 })
  })

  it('strips BOM and parses JSON', () => {
    const result = parseJsonWithBom<{ a: number }>('\uFEFF{"a":1}')
    expect(result).toEqual({ a: 1 })
  })
})

// ═══════════════════════════════════════════════════════════════════
// Hotfix 2: Low-confidence anchor blocking
// ═══════════════════════════════════════════════════════════════════

describe('findMemoAnchorLineWithConfidence — short anchorText guard', () => {
  it('skips text fallback for short anchorText (e.g. "3") and uses line-number fallback', () => {
    const lines = ['# Title', '', 'Line 3', 'Other content', 'Line 5']
    const memo: MemoV2 = {
      id: 'm_short',
      type: 'fix',
      status: 'open',
      owner: 'human',
      source: 'generic',
      color: 'red',
      text: 'Fix numbering',
      anchorText: '3', // too short for reliable text match
      anchor: 'L3|ffffffff',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const result = findMemoAnchorLineWithConfidence(lines, memo)
    // Should NOT match via text (would wrongly match "Line 3")
    // Should use line-number fallback instead
    expect(result.confidence).toBe('line_number')
    expect(result.lineIdx).toBe(2) // L3 → index 2
  })

  it('allows text fallback for long anchorText (e.g. "졸업프로젝트(1) (구 DCS(4))...")', () => {
    const longAnchor = '졸업프로젝트(1) (구 DCS(4)) 수강 가능 여부를 반드시 확인할 것'
    const lines = ['# Title', '', longAnchor, 'Other content']
    const memo: MemoV2 = {
      id: 'm_long',
      type: 'fix',
      status: 'open',
      owner: 'human',
      source: 'generic',
      color: 'red',
      text: 'Fix this',
      anchorText: longAnchor,
      anchor: 'L3|ffffffff', // hash stale
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const result = findMemoAnchorLineWithConfidence(lines, memo)
    expect(result.confidence).toBe('text')
    expect(result.lineIdx).toBe(2)
  })

  it('skips text fallback when too many matches (> MAX_TEXT_MATCHES_CONFIDENT)', () => {
    // 10 identical lines — text match is ambiguous
    const repeatedLine = 'This is a repeated anchor line content here'
    const lines = ['# Title', '']
    for (let i = 0; i < 10; i++) lines.push(repeatedLine)
    lines.push('End')

    const memo: MemoV2 = {
      id: 'm_many',
      type: 'fix',
      status: 'open',
      owner: 'human',
      source: 'generic',
      color: 'red',
      text: 'Fix',
      anchorText: repeatedLine,
      anchor: 'L5|ffffffff', // stale hash, L5 = index 4
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const result = findMemoAnchorLineWithConfidence(lines, memo)
    // 10 matches > MAX_TEXT_MATCHES_CONFIDENT → falls to line-number
    expect(result.confidence).toBe('line_number')
  })

  it('MIN_ANCHOR_TEXT_LENGTH is exported and equals 8', () => {
    expect(MIN_ANCHOR_TEXT_LENGTH).toBe(8)
  })
})

describe('HIGHLIGHT_MARK recovery — low-confidence anchor guards', () => {
  it('does not recover memo from HIGHLIGHT_MARK with short text (e.g. text="3")', () => {
    const input = `# Title

Anchor line content
<!-- HIGHLIGHT_MARK color="#fca5a5" text="3" anchor="3" -->`

    const parts = splitDocument(input)
    const recovered = parts.memos.filter(m => m.source === 'recovered-highlight')
    expect(recovered).toHaveLength(0)
  })

  it('does not recover memo from HIGHLIGHT_MARK with contaminated anchor (anchorText=)', () => {
    const input = `# Title

Real anchor line here
<!-- HIGHLIGHT_MARK color="#fca5a5" text="test" anchor="anchorText=&quot;some value&quot;" -->`

    const parts = splitDocument(input)
    const recovered = parts.memos.filter(m => m.source === 'recovered-highlight')
    expect(recovered).toHaveLength(0)
  })

  it('does not recover memo from HIGHLIGHT_MARK with contaminated anchor (<!-- prefix)', () => {
    const input = `# Title

Some body content here
<!-- HIGHLIGHT_MARK color="#fca5a5" text="problem" anchor="<!-- USER_MEMO stuff" -->`

    const parts = splitDocument(input)
    const recovered = parts.memos.filter(m => m.source === 'recovered-highlight')
    expect(recovered).toHaveLength(0)
  })

  it('still recovers memo from HIGHLIGHT_MARK with valid long anchor', () => {
    const input = `# Title

A sufficiently long anchor text line
<!-- HIGHLIGHT_MARK color="#fca5a5" text="highlighted word" anchor="A sufficiently long anchor text line" -->`

    const parts = splitDocument(input)
    const recovered = parts.memos.filter(m => m.source === 'recovered-highlight')
    expect(recovered).toHaveLength(1)
    expect(recovered[0].color).toBe('red')
    expect(recovered[0].type).toBe('fix')
  })
})

// ═══════════════════════════════════════════════════════════════════
// Hotfix 3: Meta block sidecar — stripOperationalMeta + exportCleanBody
// ═══════════════════════════════════════════════════════════════════

describe('mergeDocument — stripOperationalMeta option', () => {
  function buildDocumentParts(): DocumentParts {
    return {
      frontmatter: '---\ntitle: Test\n---\n',
      body: '# Title\n\nSome content.',
      memos: [{
        id: 'm1', type: 'fix', status: 'open', owner: 'human', source: 'generic',
        color: 'red', text: 'Fix this', anchorText: 'Some content.',
        anchor: 'L3|placeholder',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      responses: [],
      impls: [{
        id: 'impl_1', memoId: 'm1', status: 'applied',
        operations: [{ type: 'text_replace', file: '', before: 'old', after: 'new' }],
        summary: 'test impl', appliedAt: '2026-01-01T00:00:00.000Z',
      }],
      artifacts: [{
        id: 'art_1', memoId: 'm1', files: ['src/foo.ts'], linkedAt: '2026-01-01T00:00:00.000Z',
      }],
      dependencies: [{
        id: 'dep_1', from: 'm1', to: 'm2', type: 'blocks',
      }],
      checkpoints: [{
        id: 'ckpt_1', timestamp: '2026-01-01T00:00:00.000Z', note: 'Phase 1',
        fixes: 1, questions: 0, highlights: 0, sectionsReviewed: ['Title'],
      }],
      gates: [{
        id: 'gate_1', type: 'custom', status: 'blocked', blockedBy: ['m1'],
        canProceedIf: 'All clear', doneDefinition: 'Done',
      }],
      cursor: {
        taskId: 'm1', step: '1/1', nextAction: 'review',
        lastSeenHash: 'abc12345', updatedAt: '2026-01-01T00:00:00.000Z',
      },
    }
  }

  it('default (no options) — includes MEMO_IMPL, CHECKPOINT, PLAN_CURSOR', () => {
    const parts = buildDocumentParts()
    const output = mergeDocument(parts)

    expect(output).toContain('MEMO_IMPL')
    expect(output).toContain('CHECKPOINT')
    expect(output).toContain('PLAN_CURSOR')
    expect(output).toContain('USER_MEMO')
    expect(output).toContain('GATE')
    expect(output).toContain('MEMO_ARTIFACT')
    expect(output).toContain('MEMO_DEPENDENCY')
  })

  it('stripOperationalMeta: true — excludes MEMO_IMPL, CHECKPOINT, PLAN_CURSOR', () => {
    const parts = buildDocumentParts()
    const output = mergeDocument(parts, { stripOperationalMeta: true })

    expect(output).not.toContain('MEMO_IMPL')
    expect(output).not.toContain('CHECKPOINT')
    expect(output).not.toContain('PLAN_CURSOR')
  })

  it('stripOperationalMeta: true — still keeps GATE, USER_MEMO, MEMO_ARTIFACT, MEMO_DEPENDENCY', () => {
    const parts = buildDocumentParts()
    const output = mergeDocument(parts, { stripOperationalMeta: true })

    expect(output).toContain('USER_MEMO')
    expect(output).toContain('GATE')
    expect(output).toContain('MEMO_ARTIFACT')
    expect(output).toContain('MEMO_DEPENDENCY')
  })

  it('stripOperationalMeta: false — same as default (all included)', () => {
    const partsA = buildDocumentParts()
    const partsB = buildDocumentParts()
    const outputDefault = mergeDocument(partsA)
    const outputExplicit = mergeDocument(partsB, { stripOperationalMeta: false })

    expect(outputDefault).toBe(outputExplicit)
  })
})

describe('exportCleanBody', () => {
  it('returns only body + frontmatter, no metadata', () => {
    const parts: DocumentParts = {
      frontmatter: '---\ntitle: Test\n---\n',
      body: '# Title\n\nSome content.',
      memos: [{
        id: 'm1', type: 'fix', status: 'open', owner: 'human', source: 'generic',
        color: 'red', text: 'Fix', anchorText: 'content',
        anchor: 'L3|placeholder',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      responses: [],
      impls: [{
        id: 'impl_1', memoId: 'm1', status: 'applied',
        operations: [], summary: 'test', appliedAt: '2026-01-01T00:00:00.000Z',
      }],
      artifacts: [],
      dependencies: [],
      checkpoints: [],
      gates: [{
        id: 'gate_1', type: 'custom', status: 'blocked', blockedBy: ['m1'],
        canProceedIf: '', doneDefinition: '',
      }],
      cursor: null,
    }

    const clean = exportCleanBody(parts)

    expect(clean).toContain('# Title')
    expect(clean).toContain('Some content.')
    expect(clean).toContain('title: Test')
    expect(clean).not.toContain('USER_MEMO')
    expect(clean).not.toContain('MEMO_IMPL')
    expect(clean).not.toContain('GATE')
    expect(clean).not.toContain('CHECKPOINT')
  })

  it('returns body without frontmatter when frontmatter is empty', () => {
    const parts: DocumentParts = {
      frontmatter: '',
      body: '# Title\n\nContent here.',
      memos: [],
      responses: [],
      impls: [],
      artifacts: [],
      dependencies: [],
      checkpoints: [],
      gates: [],
      cursor: null,
    }

    const clean = exportCleanBody(parts)
    expect(clean.trim()).toBe('# Title\n\nContent here.')
  })
})
