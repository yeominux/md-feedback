import { describe, it, expect } from 'vitest'
import { extractHighlightMarks, stripHighlightMarks, convertMemosToHtml } from '../markdown-roundtrip'
import { splitDocument, mergeDocument, findMemoAnchorLine } from '../document-writer'
import type { MemoV2 } from '../types'

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

// ─── Real-world reproduction: phantom memo recovery from orphaned HIGHLIGHT_MARKs ───

describe('HIGHLIGHT_MARK recovery — phantom memo from deleted content', () => {
  // Real-world scenario: A MEMO_IMPL apply operation deleted email draft content from the
  // document body, but the HIGHLIGHT_MARKs for those deleted paragraphs remain at EOF.
  // splitDocument's recovery loop should NOT create memo_recovered_* memos from these
  // orphaned marks because the anchored content no longer exists in the body.

  const realWorldDocument = `# Document Title

## Section with content
Some text here about graduation requirements.

## Email section (was deleted by apply)
> ~~메일 초안 삭제~~ — 확인 완료로 불필요

<!-- HIGHLIGHT_MARK color="#fca5a5" text="교수님께 보낼 메일 초안:" anchor="교수님께 보낼 메일 초안:" -->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="제목: 졸업프로젝트 관련 문의" anchor="제목: 졸업프로젝트 관련 문의" -->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="교수님 안녕하세요" anchor="교수님 안녕하세요" -->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="본문 내용 작성" anchor="본문 내용 작성" -->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="감사합니다" anchor="감사합니다" -->
<!-- USER_MEMO
  id="realMemo1"
  type="question"
  status="open"
  owner="human"
  source="vscode"
  color="blue"
  text="이건 진짜 내 메모"
  anchorText="Some text here about graduation requirements."
  anchor="L4|00000000"
  createdAt="2026-02-21T10:00:00.000Z"
  updatedAt="2026-02-21T10:00:00.000Z"
-->`

  it('should NOT create phantom memo_recovered_* from HIGHLIGHT_MARKs whose content was deleted', () => {
    const parts = splitDocument(realWorldDocument)
    const recovered = parts.memos.filter(m => m.source === 'recovered-highlight')

    // BUG: Currently creates 5 phantom memos from the orphaned HIGHLIGHT_MARKs
    // whose anchor text (email draft paragraphs) was deleted from the body.
    // Expected: 0 phantom memos — the original content no longer exists.
    expect(recovered).toHaveLength(0)
  })

  it('should preserve the real user memo without burying it under phantom memos', () => {
    const parts = splitDocument(realWorldDocument)

    // The real user memo should always be present
    const realMemo = parts.memos.find(m => m.id === 'realMemo1')
    expect(realMemo).toBeDefined()
    expect(realMemo!.text).toBe('이건 진짜 내 메모')
    expect(realMemo!.type).toBe('question')

    // BUG: Phantom memos outnumber real memos, burying the user's actual memo.
    // The total memo count should be exactly 1 (the real memo).
    expect(parts.memos).toHaveLength(1)
  })

  it('anchorText should never contain raw HTML comment text', () => {
    const parts = splitDocument(realWorldDocument)

    for (const memo of parts.memos) {
      // BUG: Recovered phantom memos can get anchorText like
      // '<!-- HIGHLIGHT_MARK color="#fca5a5" text="교수님께 보낼 메...'
      // because findMemoAnchorLineWithConfidence matches the HIGHLIGHT_MARK comment line.
      expect(memo.anchorText).not.toContain('<!-- HIGHLIGHT_MARK')
      expect(memo.anchorText).not.toContain('<!-- USER_MEMO')
      expect(memo.anchorText).not.toContain('<!-- MEMO_IMPL')
    }
  })
})

describe('HIGHLIGHT_MARK recovery — content fully absent from body', () => {
  // Simpler reproduction: HIGHLIGHT_MARK anchor text is completely absent from the body.
  // Recovery should not create a phantom memo with empty/comment-based anchor.

  it('should not recover memo when HIGHLIGHT_MARK anchor text is absent from body', () => {
    const input = `# Title

Remaining content only.

<!-- HIGHLIGHT_MARK color="#fca5a5" text="deleted paragraph text" anchor="deleted paragraph text" -->`

    const parts = splitDocument(input)
    const recovered = parts.memos.filter(m => m.source === 'recovered-highlight')

    // BUG: Recovery creates a phantom memo even though "deleted paragraph text"
    // does not exist in the body. The bodyLines.findIndex search at line 528
    // may still match the HIGHLIGHT_MARK comment line itself since it contains
    // the anchor text as an attribute value.
    expect(recovered).toHaveLength(0)
  })

  it('should not recover when multiple HIGHLIGHT_MARKs reference absent content', () => {
    const input = `# Title

Only this content remains.

<!-- HIGHLIGHT_MARK color="#fca5a5" text="first deleted line" anchor="first deleted line" -->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="second deleted line" anchor="second deleted line" -->
<!-- HIGHLIGHT_MARK color="#93c5fd" text="third deleted question" anchor="third deleted question" -->`

    const parts = splitDocument(input)
    const recovered = parts.memos.filter(m => m.source === 'recovered-highlight')

    // BUG: Currently creates 3 phantom memos from marks whose content is gone.
    expect(recovered).toHaveLength(0)
  })
})

describe('findMemoAnchorLine — should not match HTML comment lines', () => {
  it('should not return index of a HIGHLIGHT_MARK comment line', () => {
    // Simulate bodyLines that include HIGHLIGHT_MARK comments (as currently happens)
    const lines = [
      '# Title',
      '',
      'Real body content.',
      '<!-- HIGHLIGHT_MARK color="#fca5a5" text="Real body content." anchor="Real body content." -->',
    ]
    const memo: MemoV2 = {
      id: 'test1',
      type: 'fix',
      status: 'open',
      owner: 'human',
      source: 'recovered-highlight',
      color: 'red',
      text: 'Fix this',
      anchorText: 'Real body content.',
      anchor: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    const idx = findMemoAnchorLine(lines, memo)
    // Should match the actual content line (index 2), not the comment line (index 3)
    expect(idx).toBe(2)
    // BUG: If the comment line is accidentally matched, the anchorText refresh
    // would produce raw HTML comment content.
    expect(lines[idx]).not.toContain('<!-- HIGHLIGHT_MARK')
  })

  it('should not return index of a USER_MEMO comment line', () => {
    const lines = [
      '# Title',
      'Target line here.',
      '<!-- USER_MEMO id="m1" type="fix" text="Target line here." -->',
    ]
    const memo: MemoV2 = {
      id: 'test2',
      type: 'fix',
      status: 'open',
      owner: 'human',
      source: 'generic',
      color: 'red',
      text: 'Fix',
      anchorText: 'Target line here.',
      anchor: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    const idx = findMemoAnchorLine(lines, memo)
    // Should match line 1 (body content), not line 2 (comment)
    expect(idx).toBe(1)
    expect(lines[idx]).not.toContain('<!--')
  })
})

describe('HIGHLIGHT_MARK recovery — real-world with MEMO_IMPL', () => {
  // Full real-world scenario: MEMO_IMPL applied a deletion, consuming the original memo.
  // HIGHLIGHT_MARKs from the deleted content remain orphaned at EOF.
  // A separate user question memo exists and should not be buried.

  const fullDocument = `# 졸업 프로젝트 계획

## 할 일 목록
Some text here about graduation requirements.

## 메일 섹션
> ~~메일 초안 삭제~~ — 확인 완료로 불필요

<!-- HIGHLIGHT_MARK color="#fca5a5" text="교수님께 보낼 메일 초안:" anchor="교수님께 보낼 메일 초안:" -->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="제목: 졸업프로젝트 관련 문의" anchor="제목: 졸업프로젝트 관련 문의" -->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="본문 내용" anchor="본문 내용" -->
<!-- USER_MEMO
  id="userQuestion1"
  type="question"
  status="open"
  owner="human"
  source="vscode"
  color="blue"
  text="이 섹션 필요한가요?"
  anchorText="Some text here about graduation requirements."
  anchor="L4|00000000"
  createdAt="2026-02-21T10:00:00.000Z"
  updatedAt="2026-02-21T10:00:00.000Z"
-->
<!-- MEMO_IMPL
  id="impl_1"
  memoId="deletedMemo1"
  status="applied"
  operations="[]"
  summary="메일 초안 삭제"
  appliedAt="2026-02-21T09:00:00.000Z"
-->`

  it('should not create phantom memos from orphaned HIGHLIGHT_MARKs after MEMO_IMPL apply', () => {
    const parts = splitDocument(fullDocument)
    const recovered = parts.memos.filter(m => m.source === 'recovered-highlight')

    // BUG: 3 phantom memos are created from the stale HIGHLIGHT_MARKs.
    expect(recovered).toHaveLength(0)
  })

  it('should preserve the real user question memo', () => {
    const parts = splitDocument(fullDocument)

    const realMemo = parts.memos.find(m => m.id === 'userQuestion1')
    expect(realMemo).toBeDefined()
    expect(realMemo!.type).toBe('question')
    expect(realMemo!.color).toBe('blue')
    expect(realMemo!.text).toBe('이 섹션 필요한가요?')
  })

  it('should correctly parse the MEMO_IMPL', () => {
    const parts = splitDocument(fullDocument)

    expect(parts.impls).toHaveLength(1)
    expect(parts.impls[0].memoId).toBe('deletedMemo1')
    expect(parts.impls[0].status).toBe('applied')
  })

  it('total memo count should only include real user memos', () => {
    const parts = splitDocument(fullDocument)

    // Only the real user memo should be present
    expect(parts.memos).toHaveLength(1)
    expect(parts.memos[0].id).toBe('userQuestion1')
  })
})

// ─── Legacy phantom memo cleanup: pre-existing memo_recovered_* USER_MEMOs ───

describe('Legacy phantom memo cleanup — persisted memo_recovered_* from old code', () => {
  // Real-world scenario: The old code created memo_recovered_* USER_MEMOs from stale
  // HIGHLIGHT_MARKs and they were persisted in the file. When the file is opened with
  // updated code, these phantom memos should be discarded if their anchor text references
  // deleted content.

  it('should discard persisted memo_recovered_* whose anchorText references deleted content', () => {
    const doc = `# Title

Remaining content only.

<!-- USER_MEMO
  id="memo_recovered_abc123"
  type="fix"
  status="open"
  owner="human"
  source="recovered-highlight"
  color="red"
  text="교수님께 보낼 메일 초안:"
  anchorText="교수님께 보낼 메일 초안:"
  anchor="L99|deadbeef"
  createdAt="2026-02-21T09:00:00.000Z"
  updatedAt="2026-02-21T09:00:00.000Z"
-->`

    const parts = splitDocument(doc)
    // "교수님께 보낼 메일 초안:" does not exist in body → phantom should be discarded
    expect(parts.memos).toHaveLength(0)
  })

  it('should discard persisted memo_recovered_* with corrupted HTML comment anchorText', () => {
    const doc = `# Title

Some content.

<!-- USER_MEMO
  id="memo_recovered_def456"
  type="fix"
  status="open"
  owner="human"
  source="recovered-highlight"
  color="red"
  text="Some fix"
  anchorText="<!-- HIGHLIGHT_MARK color=&quot;#fca5a5&quot; text=&quot;Some fix&quot;"
  anchor="L3|00000000"
  createdAt="2026-02-21T09:00:00.000Z"
  updatedAt="2026-02-21T09:00:00.000Z"
-->`

    const parts = splitDocument(doc)
    // anchorText contains raw HTML comment → corrupted phantom should be discarded
    expect(parts.memos).toHaveLength(0)
  })

  it('should keep valid recovered-highlight memos whose anchorText exists in body', () => {
    const doc = `# Title

Some important content here.

<!-- USER_MEMO
  id="memo_recovered_valid1"
  type="fix"
  status="open"
  owner="human"
  source="recovered-highlight"
  color="red"
  text="Fix this"
  anchorText="Some important content here."
  anchor="L3|00000000"
  createdAt="2026-02-21T09:00:00.000Z"
  updatedAt="2026-02-21T09:00:00.000Z"
-->`

    const parts = splitDocument(doc)
    // anchorText matches actual body content → should be kept
    expect(parts.memos).toHaveLength(1)
    expect(parts.memos[0].id).toBe('memo_recovered_valid1')
  })

  it('should keep real user memos while discarding phantom recovered ones', () => {
    const doc = `# Title

Some text here about graduation requirements.

## Deleted section
> ~~메일 초안 삭제~~ — 확인 완료로 불필요

<!-- USER_MEMO
  id="realUserMemo"
  type="question"
  status="open"
  owner="human"
  source="vscode"
  color="blue"
  text="이건 진짜 내 메모"
  anchorText="Some text here about graduation requirements."
  anchor="L3|00000000"
  createdAt="2026-02-21T10:00:00.000Z"
  updatedAt="2026-02-21T10:00:00.000Z"
-->
<!-- USER_MEMO
  id="memo_recovered_phantom1"
  type="fix"
  status="open"
  owner="human"
  source="recovered-highlight"
  color="red"
  text="교수님께 보낼 메일 초안:"
  anchorText="교수님께 보낼 메일 초안:"
  anchor="L99|deadbeef"
  createdAt="2026-02-21T09:00:00.000Z"
  updatedAt="2026-02-21T09:00:00.000Z"
-->
<!-- USER_MEMO
  id="memo_recovered_phantom2"
  type="fix"
  status="open"
  owner="human"
  source="recovered-highlight"
  color="red"
  text="제목: 졸업프로젝트 관련 문의"
  anchorText="제목: 졸업프로젝트 관련 문의"
  anchor="L99|deadbeef"
  createdAt="2026-02-21T09:00:00.000Z"
  updatedAt="2026-02-21T09:00:00.000Z"
-->`

    const parts = splitDocument(doc)
    // Only the real user memo should remain; 2 phantom memos discarded
    expect(parts.memos).toHaveLength(1)
    expect(parts.memos[0].id).toBe('realUserMemo')
    expect(parts.memos[0].source).toBe('vscode')
  })

  it('should clean phantom memos AND stale HIGHLIGHT_MARKs in one merge cycle', () => {
    const doc = `# Title

Remaining content only.

<!-- HIGHLIGHT_MARK color="#fca5a5" text="deleted paragraph" anchor="deleted paragraph" -->
<!-- USER_MEMO
  id="memo_recovered_stale1"
  type="fix"
  status="open"
  owner="human"
  source="recovered-highlight"
  color="red"
  text="deleted paragraph"
  anchorText="deleted paragraph"
  anchor="L99|deadbeef"
  createdAt="2026-02-21T09:00:00.000Z"
  updatedAt="2026-02-21T09:00:00.000Z"
-->`

    // splitDocument discards the phantom memo
    const parts = splitDocument(doc)
    expect(parts.memos).toHaveLength(0)

    // mergeDocument cleans up the stale HIGHLIGHT_MARK
    const merged = mergeDocument(parts)
    expect(merged).not.toContain('HIGHLIGHT_MARK')
    expect(merged).not.toContain('memo_recovered_stale1')
    expect(merged).toContain('Remaining content only.')
  })
})

describe('HIGHLIGHT_MARK recovery guard — skip when real memo already exists', () => {
  it('does not create recovered red memos when a non-recovered red memo already exists', () => {
    const doc = `# Title

본문 첫 줄.

<!-- USER_MEMO
  id="real_fix_1"
  type="fix"
  status="open"
  owner="human"
  source="vscode"
  color="red"
  text="한 번에 남긴 실제 메모"
  anchorText="본문 첫 줄."
  anchor="L3|00000000"
  createdAt="2026-02-22T00:00:00.000Z"
  updatedAt="2026-02-22T00:00:00.000Z"
-->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="문장1" anchor="본문 첫 줄." -->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="문장2" anchor="본문 첫 줄." -->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="문장3" anchor="본문 첫 줄." -->`

    const parts = splitDocument(doc)
    const recoveredRed = parts.memos.filter(m => m.source === 'recovered-highlight' && m.color === 'red')
    expect(recoveredRed).toHaveLength(0)
    expect(parts.memos.some(m => m.id === 'real_fix_1')).toBe(true)
  })

  it('does not create recovered blue memos when a non-recovered blue memo already exists', () => {
    const doc = `# Title

본문 첫 줄.

<!-- USER_MEMO
  id="real_q_1"
  type="question"
  status="open"
  owner="human"
  source="vscode"
  color="blue"
  text="한 번에 남긴 실제 질문 메모"
  anchorText="본문 첫 줄."
  anchor="L3|00000000"
  createdAt="2026-02-22T00:00:00.000Z"
  updatedAt="2026-02-22T00:00:00.000Z"
-->
<!-- HIGHLIGHT_MARK color="#93c5fd" text="질문문장1" anchor="본문 첫 줄." -->
<!-- HIGHLIGHT_MARK color="#93c5fd" text="질문문장2" anchor="본문 첫 줄." -->`

    const parts = splitDocument(doc)
    const recoveredBlue = parts.memos.filter(m => m.source === 'recovered-highlight' && m.color === 'blue')
    expect(recoveredBlue).toHaveLength(0)
    expect(parts.memos.some(m => m.id === 'real_q_1')).toBe(true)
  })

  it('still recovers when only recovered-highlight memos exist (no authoritative memo)', () => {
    const doc = `# Title

본문 첫 줄은 충분히 긴 문장입니다.

<!-- USER_MEMO
  id="old_recovered_1"
  type="fix"
  status="open"
  owner="human"
  source="recovered-highlight"
  color="red"
  text="예전 복구 메모"
  anchorText="예전 복구 메모"
  anchor="L10|deadbeef"
  createdAt="2026-02-22T00:00:00.000Z"
  updatedAt="2026-02-22T00:00:00.000Z"
-->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="본문 첫 줄은 충분히 긴 문장입니다." anchor="본문 첫 줄은 충분히 긴 문장입니다." -->`

    const parts = splitDocument(doc)
    const recoveredRed = parts.memos.filter(m => m.source === 'recovered-highlight' && m.color === 'red')
    expect(recoveredRed.length).toBeGreaterThanOrEqual(1)
  })

  it('applies guard per color when fix and question memos coexist', () => {
    const doc = `# Title

본문 첫 줄은 충분히 긴 문장입니다.

<!-- USER_MEMO
  id="real_fix_mix"
  type="fix"
  status="open"
  owner="human"
  source="vscode"
  color="red"
  text="실제 fix 메모"
  anchorText="본문 첫 줄은 충분히 긴 문장입니다."
  anchor="L3|00000000"
  createdAt="2026-02-22T00:00:00.000Z"
  updatedAt="2026-02-22T00:00:00.000Z"
-->
<!-- USER_MEMO
  id="real_q_mix"
  type="question"
  status="open"
  owner="human"
  source="vscode"
  color="blue"
  text="실제 question 메모"
  anchorText="본문 첫 줄은 충분히 긴 문장입니다."
  anchor="L3|00000000"
  createdAt="2026-02-22T00:00:00.000Z"
  updatedAt="2026-02-22T00:00:00.000Z"
-->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="red 조각 1" anchor="본문 첫 줄은 충분히 긴 문장입니다." -->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="red 조각 2" anchor="본문 첫 줄은 충분히 긴 문장입니다." -->
<!-- HIGHLIGHT_MARK color="#93c5fd" text="blue 조각 1" anchor="본문 첫 줄은 충분히 긴 문장입니다." -->
<!-- HIGHLIGHT_MARK color="#93c5fd" text="blue 조각 2" anchor="본문 첫 줄은 충분히 긴 문장입니다." -->`

    const parts = splitDocument(doc)
    const recovered = parts.memos.filter(m => m.source === 'recovered-highlight')
    expect(recovered).toHaveLength(0)
    expect(parts.memos.some(m => m.id === 'real_fix_mix')).toBe(true)
    expect(parts.memos.some(m => m.id === 'real_q_mix')).toBe(true)
  })

  it('prevents fragment-based recovered memos for long paragraph fix memo', () => {
    const para = '이 문단은 졸업요건 계획을 한 번에 검토한 긴 문단이며 과목 우선순위와 시간표 제약을 함께 다룹니다.'
    const doc = `# Title

${para}

<!-- USER_MEMO
  id="real_fix_long"
  type="fix"
  status="open"
  owner="human"
  source="vscode"
  color="red"
  text="긴 문단에 대한 실제 fix 메모"
  anchorText="${para}"
  anchor="L3|00000000"
  createdAt="2026-02-22T00:00:00.000Z"
  updatedAt="2026-02-22T00:00:00.000Z"
-->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="졸업요건 계획" anchor="${para}" -->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="과목 우선순위" anchor="${para}" -->
<!-- HIGHLIGHT_MARK color="#fca5a5" text="시간표 제약" anchor="${para}" -->`

    const parts = splitDocument(doc)
    const recoveredRed = parts.memos.filter(m => m.source === 'recovered-highlight' && m.color === 'red')
    expect(recoveredRed).toHaveLength(0)
    expect(parts.memos.some(m => m.id === 'real_fix_long')).toBe(true)
  })

  it('prevents fragment-based recovered memos for long paragraph question memo', () => {
    const para = '이 문단은 장학금과 성적경고 조건을 함께 정리한 긴 문단이며 다음 학기 전략을 하나의 맥락으로 설명합니다.'
    const doc = `# Title

${para}

<!-- USER_MEMO
  id="real_question_long"
  type="question"
  status="open"
  owner="human"
  source="vscode"
  color="blue"
  text="긴 문단에 대한 실제 question 메모"
  anchorText="${para}"
  anchor="L3|00000000"
  createdAt="2026-02-22T00:00:00.000Z"
  updatedAt="2026-02-22T00:00:00.000Z"
-->
<!-- HIGHLIGHT_MARK color="#93c5fd" text="장학금 조건" anchor="${para}" -->
<!-- HIGHLIGHT_MARK color="#93c5fd" text="성적경고 조건" anchor="${para}" -->
<!-- HIGHLIGHT_MARK color="#93c5fd" text="다음 학기 전략" anchor="${para}" -->`

    const parts = splitDocument(doc)
    const recoveredBlue = parts.memos.filter(m => m.source === 'recovered-highlight' && m.color === 'blue')
    expect(recoveredBlue).toHaveLength(0)
    expect(parts.memos.some(m => m.id === 'real_question_long')).toBe(true)
  })
})
