/**
 * E2E test: verifies the full split/merge workflow for the problematic
 * report_clean.md document structure, where a recovered memo must anchor
 * to a blockquote callout line containing backslash-escaped brackets
 * and bold formatting: > \[!CAUTION\] **text**
 *
 * Tests two scenarios:
 *   A) HIGHLIGHT_MARK-only recovery (no pre-existing USER_MEMO)
 *      — the recovered memo must find the callout anchor on the FIRST split
 *   B) Full document with both USER_MEMO + HIGHLIGHT_MARK
 *      — after merge→split the memo must converge to the callout anchor
 *      — all metadata (gates, checkpoints, cursor, impls) must survive
 */
import { describe, it, expect } from 'vitest'
import { splitDocument, mergeDocument, stripMarkdownFormatting } from '../index'

// The callout line as it appears in the document body (with backslash-escaped brackets)
const CALLOUT_LINE = '> \\[!CAUTION\\] **졸업프로젝트(1) (구 DCS(4)) 수강 가능 여부를 반드시 학과 사무실에 확인할 것**'

// Helper to find the callout line in body (has \[ and \] escapes)
const isCalloutLine = (l: string) => l.includes('\\[!CAUTION\\]')

// ── Scenario A: only a HIGHLIGHT_MARK, no pre-existing USER_MEMO ──
// This is the "clean recovery" path — stripMarkdownFormatting must
// correctly strip the callout line so the recovered memo gets a valid anchor.
const DOC_HIGHLIGHT_ONLY = `# 졸업요건 분석

## ‼️ 최우선 확인 사항

> \\[!CAUTION\\] **졸업프로젝트(1) (구 DCS(4)) 수강 가능 여부를 반드시 학과 사무실에 확인할 것**
>
> 졸업규정 원문: *"3학년 전공 6개 이상을 수강하여야 졸업프로젝트를 수강할 수 있다."*

---

## 1. 수강 내역

| 학수번호 | 과목명 | 학점 | 성적 |
| --- | --- | --- | --- |
| 001011 | 논리적사고와글쓰기 | 3 | A+ |

---

## 9. 한눈에 보기

**최우선 행동:**

1. ✅ ~~학과 사무실에 졸업프로젝트(1) 수강 가능 여부 확인~~ — 동시수강 가능 확인 완료

> 졸업규정 Q&A: *"개별 내규 관련 문의는 학부사무실로 연락 바랍니다."*

<!-- HIGHLIGHT_MARK color="#fca5a5" text="졸업프로젝트(1) (구 DCS(4)) 수강 가능 여부를 반드시 학과 사무실에 확인할 것" anchor="[!CAUTION] 졸업프로젝트(1) (구 DCS(4)) 수강 가능 여부를 반드시 학과 사무실에 확인할 것" -->
`

// ── Scenario B: full document with USER_MEMO + HIGHLIGHT_MARK + metadata ──
const DOC_FULL = `# 디자인컨버전스학부 졸업요건 종합 분석 (2022학번)

> 조형대학 디자인컨버전스학부 (R048) | 2022학년도 입학

---

## ‼️ 최우선 확인 사항

> \\[!CAUTION\\] **졸업프로젝트(1) (구 DCS(4)) 수강 가능 여부를 반드시 학과 사무실에 확인할 것**
>
> 졸업규정(2026.02.13. 개정) p.5 원문: *"3학년 개설 전공 교과목 6개 이상을 **수강하여야** 졸업프로젝트(1),(2)를 수강할 수 있다."*
>
> 현재 3학년 전공 이수: **5과목** (6개 필요 — 1과목 부족)

> \\[!WARNING\\] **특성화교양 인정 여부도 학적과에 확인할 것**
>
> 수강한 과목: **컴퓨터프로그래밍 (학수번호 008750)** — 이수구분 "교선", sw(소양)

---

## 1. 학기별 수강 내역

### 2022-1 (1학년 1학기) — 취득 19학점 / 평점 3.58

| 학수번호 | 과목명 | 이수구분 | 학점 | 성적 |
| --- | --- | --- | --- | --- |
| 001011 | 논리적사고와글쓰기(인문) | 교필 | 3 | A+ |
| 002534 | 컴퓨터활용기초 *sw(기초)* | 공교3 | 3 | B+ |

---

## 9. 한눈에 보기

\`\`\`plaintext
              졸업요건 충족 현황
┌──────────────────────────────────────┐
│  ✅ 교양필수 6/6학점                  │
│  ❌ 총학점 103/132 (-29)             │
└──────────────────────────────────────┘
\`\`\`

**최우선 행동:**

1. ✅ ~~학과 사무실에 졸업프로젝트(1) 수강 가능 여부 확인~~ — 동시수강 가능 확인 완료

> 졸업규정 Q&A 마지막 안내: *"개별 내규 관련 문의는 학부사무실로 연락 바랍니다."*

<!-- USER_MEMO id="memo_recovered_7857da0a" color="red" status="done" : 졸업프로젝트(1) (구 DCS(4)) 수강 가능 여부를 반드시 학과 사무실에 확인할 것 -->

<!-- HIGHLIGHT_MARK color="#fca5a5" text="졸업프로젝트(1) (구 DCS(4)) 수강 가능 여부를 반드시 학과 사무실에 확인할 것" anchor="[!CAUTION] 졸업프로젝트(1) (구 DCS(4)) 수강 가능 여부를 반드시 학과 사무실에 확인할 것" -->

<!-- MEMO_IMPL
  id="impl_mluqlbjt_mdtctr"
  memoId="memo_recovered_7857da0a"
  status="applied"
  operations="[{&quot;type&quot;:&quot;text_replace&quot;,&quot;file&quot;:&quot;&quot;,&quot;before&quot;:&quot;old text&quot;,&quot;after&quot;:&quot;new text&quot;}]"
  summary="text_replace for memo_recovered_7857da0a"
  appliedAt="2026-02-20T10:18:09.209Z"
-->

<!-- GATE
  id="gate-mluqi9yk-ymw1lw"
  type="merge"
  status="proceed"
  blockedBy=""
  canProceedIf=""
  doneDefinition="All review annotations resolved"
-->

<!-- CHECKPOINT id="ckpt_mluqi9xh_phcqdh" time="2026-02-20T10:15:47.141Z" note="auto" fixes=1 questions=0 highlights=0 sections="‼️ 최우선 확인 사항" -->

<!-- CHECKPOINT id="ckpt_mluqlh54_ma8idw" time="2026-02-20T10:18:16.456Z" note="졸업프로젝트(1) 동시수강 확인 완료 반영" fixes=1 questions=0 highlights=0 sections="‼️ 최우선 확인 사항,9. 한눈에 보기" -->

<!-- PLAN_CURSOR
  taskId="memo_recovered_7857da0a"
  step="0/1 resolved"
  nextAction="Resolve: memo_recovered_7857da0a"
  lastSeenHash="692fb659"
  updatedAt="2026-02-20T10:18:09.209Z"
-->
`

describe('report_clean.md E2E — stripMarkdownFormatting for callout anchors', () => {
  it('strips blockquote + backslash-escaped brackets + bold from callout line', () => {
    const result = stripMarkdownFormatting(CALLOUT_LINE)
    expect(result).toContain('[!CAUTION]')
    expect(result).toContain('졸업프로젝트(1)')
    expect(result).not.toContain('**')
    expect(result).not.toMatch(/^>/)
  })

  it('stripped callout contains the HIGHLIGHT_MARK anchor text', () => {
    const anchorText = '[!CAUTION] 졸업프로젝트(1) (구 DCS(4)) 수강 가능 여부를 반드시 학과 사무실에 확인할 것'
    const strippedCallout = stripMarkdownFormatting(CALLOUT_LINE)
    const strippedAnchor = stripMarkdownFormatting(anchorText)
    // The stripped callout must contain the stripped anchor for findIndex to match
    expect(strippedCallout).toContain(strippedAnchor)
  })
})

describe('report_clean.md E2E — HIGHLIGHT_MARK recovery (no pre-existing memo)', () => {
  it('recovers a memo from HIGHLIGHT_MARK with a valid anchor', () => {
    const parts = splitDocument(DOC_HIGHLIGHT_ONLY)
    // Should recover exactly 1 memo from the HIGHLIGHT_MARK
    const recovered = parts.memos.filter(m => m.source === 'recovered-highlight')
    expect(recovered.length).toBe(1)
    expect(recovered[0].anchor).not.toBe('')
    expect(recovered[0].anchor).toMatch(/^L\d+\|[0-9a-f]{8}$/)
  })

  it('recovered memo anchor points to the callout line, not the end', () => {
    const parts = splitDocument(DOC_HIGHLIGHT_ONLY)
    const recovered = parts.memos.find(m => m.source === 'recovered-highlight')!
    const bodyLines = parts.body.split('\n')
    const calloutIdx = bodyLines.findIndex(isCalloutLine)

    const anchorMatch = recovered.anchor.match(/^L(\d+)\|/)!
    const anchorLineNum = parseInt(anchorMatch[1], 10) - 1 // 0-indexed
    // The anchor should point to the callout line
    expect(anchorLineNum).toBe(calloutIdx)
    expect(isCalloutLine(bodyLines[anchorLineNum])).toBe(true)
  })

  it('after merge, memo is placed near the callout line', () => {
    const parts = splitDocument(DOC_HIGHLIGHT_ONLY)
    const merged = mergeDocument(parts)
    const lines = merged.split('\n')

    const calloutIdx = lines.findIndex(isCalloutLine)
    const memoIdx = lines.findIndex(l => l.includes('USER_MEMO'))
    expect(calloutIdx).toBeGreaterThanOrEqual(0)
    expect(memoIdx).toBeGreaterThanOrEqual(0)

    // Memo should be close to the callout (within the blockquote section)
    const distance = memoIdx - calloutIdx
    expect(distance).toBeGreaterThan(0) // memo after callout
    expect(distance).toBeLessThan(15) // not far away
  })

  it('round-trip is stable (no drift on second cycle)', () => {
    const parts1 = splitDocument(DOC_HIGHLIGHT_ONLY)
    const merged1 = mergeDocument(parts1)
    const parts2 = splitDocument(merged1)
    const merged2 = mergeDocument(parts2)

    const memo1 = parts1.memos.find(m => m.source === 'recovered-highlight')!
    const memo2 = parts2.memos.find(m => m.id === memo1.id)!

    // Anchor should be stable between cycles
    expect(memo2.anchor).toBe(memo1.anchor)
    expect(memo2.anchor).not.toBe('')

    // Memo line position should be stable
    const findMemoLine = (text: string) =>
      text.split('\n').findIndex(l => l.includes('USER_MEMO') && l.includes(memo1.id))
    expect(Math.abs(findMemoLine(merged2) - findMemoLine(merged1))).toBeLessThanOrEqual(1)
  })
})

describe('report_clean.md E2E — full document with all metadata', () => {
  it('splitDocument parses without throwing', () => {
    const parts = splitDocument(DOC_FULL)
    expect(parts).toBeDefined()
    expect(parts.memos.length).toBeGreaterThanOrEqual(1)
  })

  it('memo_recovered_7857da0a exists and has a valid anchor', () => {
    const parts = splitDocument(DOC_FULL)
    const memo = parts.memos.find(m => m.id === 'memo_recovered_7857da0a')
    expect(memo).toBeDefined()
    expect(memo!.anchor).not.toBe('')
    expect(memo!.anchor).toMatch(/^L\d+\|[0-9a-f]{8}$/)
    expect(memo!.color).toBe('red')
    expect(memo!.status).toBe('done')
    expect(memo!.text).toContain('졸업프로젝트(1)')
  })

  it('MEMO_IMPL records survive the split', () => {
    const parts = splitDocument(DOC_FULL)
    expect(parts.impls.length).toBeGreaterThanOrEqual(1)
    const impl = parts.impls.find(i => i.id === 'impl_mluqlbjt_mdtctr')
    expect(impl).toBeDefined()
    expect(impl!.memoId).toBe('memo_recovered_7857da0a')
    expect(impl!.status).toBe('applied')
  })

  it('gate survives the split', () => {
    const parts = splitDocument(DOC_FULL)
    expect(parts.gates).toHaveLength(1)
    expect(parts.gates[0].id).toBe('gate-mluqi9yk-ymw1lw')
    expect(parts.gates[0].type).toBe('merge')
    expect(parts.gates[0].status).toBe('proceed')
  })

  it('checkpoints survive the split', () => {
    const parts = splitDocument(DOC_FULL)
    expect(parts.checkpoints).toHaveLength(2)
    expect(parts.checkpoints[0].id).toBe('ckpt_mluqi9xh_phcqdh')
    expect(parts.checkpoints[1].id).toBe('ckpt_mluqlh54_ma8idw')
  })

  it('plan cursor survives the split', () => {
    const parts = splitDocument(DOC_FULL)
    expect(parts.cursor).not.toBeNull()
    expect(parts.cursor!.taskId).toBe('memo_recovered_7857da0a')
    expect(parts.cursor!.step).toBe('0/1 resolved')
  })

  it('after merge, output contains all metadata sections', () => {
    const parts = splitDocument(DOC_FULL)
    const merged = mergeDocument(parts)
    expect(merged).toContain('MEMO_IMPL')
    expect(merged).toContain('impl_mluqlbjt_mdtctr')
    expect(merged).toContain('GATE')
    expect(merged).toContain('gate-mluqi9yk-ymw1lw')
    expect(merged).toContain('CHECKPOINT')
    expect(merged).toContain('ckpt_mluqi9xh_phcqdh')
    expect(merged).toContain('PLAN_CURSOR')
    expect(merged).toContain('memo_recovered_7857da0a')
  })

  it('after merge, body content is preserved', () => {
    const parts = splitDocument(DOC_FULL)
    const merged = mergeDocument(parts)
    expect(merged).toContain('# 디자인컨버전스학부 졸업요건 종합 분석 (2022학번)')
    expect(merged).toContain('| 001011 | 논리적사고와글쓰기(인문) | 교필 | 3 | A+ |')
    expect(merged).toContain('졸업요건 충족 현황')
  })

  it('after merge → split cycle, memo converges to the callout anchor', () => {
    // First cycle: v0.3 memo parsed (anchor = line above in source)
    const parts1 = splitDocument(DOC_FULL)
    const merged1 = mergeDocument(parts1)

    // Second cycle: now in v0.4 format with anchorText, should find callout
    const parts2 = splitDocument(merged1)
    const memo = parts2.memos.find(m => m.id === 'memo_recovered_7857da0a')!
    expect(memo.anchor).not.toBe('')

    const bodyLines = parts2.body.split('\n')
    const anchorMatch = memo.anchor.match(/^L(\d+)\|/)!
    const anchorLineIdx = parseInt(anchorMatch[1], 10) - 1
    // After convergence, the anchor should point to the callout line
    expect(isCalloutLine(bodyLines[anchorLineIdx])).toBe(true)
  })

  it('metadata counts preserved across two round-trips', () => {
    const parts1 = splitDocument(DOC_FULL)
    const merged1 = mergeDocument(parts1)
    const parts2 = splitDocument(merged1)
    const merged2 = mergeDocument(parts2)
    const parts3 = splitDocument(merged2)

    // After second cycle, counts must be stable
    expect(parts3.memos.length).toBe(parts2.memos.length)
    expect(parts3.impls.length).toBe(parts2.impls.length)
    expect(parts3.gates.length).toBe(parts2.gates.length)
    expect(parts3.checkpoints.length).toBe(parts2.checkpoints.length)
    expect(parts3.cursor).not.toBeNull()
    expect(parts3.cursor!.taskId).toBe(parts2.cursor!.taskId)
  })

  it('anchor is stable after convergence (no drift on third cycle)', () => {
    // First cycle (v0.3 → v0.4 conversion)
    const parts1 = splitDocument(DOC_FULL)
    const merged1 = mergeDocument(parts1)

    // Second cycle (converged v0.4)
    const parts2 = splitDocument(merged1)
    const merged2 = mergeDocument(parts2)

    // Third cycle (must be stable)
    const parts3 = splitDocument(merged2)
    const merged3 = mergeDocument(parts3)

    const memo2 = parts2.memos.find(m => m.id === 'memo_recovered_7857da0a')!
    const memo3 = parts3.memos.find(m => m.id === 'memo_recovered_7857da0a')!
    expect(memo3.anchor).toBe(memo2.anchor)

    // Position in output should be stable
    const findMemoLine = (text: string) =>
      text.split('\n').findIndex(l => l.includes('USER_MEMO') && l.includes('memo_recovered_7857da0a'))
    expect(Math.abs(findMemoLine(merged3) - findMemoLine(merged2))).toBeLessThanOrEqual(1)
  })
})
