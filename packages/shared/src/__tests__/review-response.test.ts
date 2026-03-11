import { describe, it, expect } from 'vitest'
import { splitDocument, mergeDocument } from '../index'
import { convertMemosToHtml } from '../markdown-roundtrip'

describe('B-10: REVIEW_RESPONSE parsing', () => {
  it('parses basic REVIEW_RESPONSE markers', () => {
    const input = `# Plan

Question here.
<!-- USER_MEMO id="q1" color="blue" status="open" : What does this mean? -->
<!-- REVIEW_RESPONSE to="q1" -->
This is the AI answer.
<!-- /REVIEW_RESPONSE -->`

    const parts = splitDocument(input)

    expect(parts.responses).toHaveLength(1)
    expect(parts.responses[0].to).toBe('q1')
    expect(parts.body).toContain('This is the AI answer.')
    expect(parts.body).not.toContain('REVIEW_RESPONSE')
  })

  it('parses multi-line response content', () => {
    const input = `Some text.
<!-- REVIEW_RESPONSE to="m1" -->
Line 1 of answer.
Line 2 of answer.
Line 3 of answer.
<!-- /REVIEW_RESPONSE -->`

    const parts = splitDocument(input)

    expect(parts.responses).toHaveLength(1)
    expect(parts.body).toContain('Line 1 of answer.')
    expect(parts.body).toContain('Line 3 of answer.')
  })

  it('parses empty response', () => {
    const input = `Some text.
<!-- REVIEW_RESPONSE to="m1" -->
<!-- /REVIEW_RESPONSE -->`

    const parts = splitDocument(input)

    expect(parts.responses).toHaveLength(1)
    expect(parts.responses[0].bodyStartIdx).toBe(parts.responses[0].bodyEndIdx + 1)
  })

  it('handles USER_MEMO inside REVIEW_RESPONSE', () => {
    const input = `Anchor text.
<!-- REVIEW_RESPONSE to="q1" -->
AI says this thing.
<!-- USER_MEMO id="m2" color="red" status="open" : Fix this part -->
Rest of answer.
<!-- /REVIEW_RESPONSE -->`

    const parts = splitDocument(input)

    expect(parts.responses).toHaveLength(1)
    expect(parts.memos).toHaveLength(1)
    expect(parts.memos[0].id).toBe('m2')
    expect(parts.body).toContain('AI says this thing.')
    expect(parts.body).toContain('Rest of answer.')
  })
})

describe('B-10: REVIEW_RESPONSE roundtrip', () => {
  it('mergeDocument restores response markers', () => {
    const input = `# Plan

Question here.
<!-- USER_MEMO id="q1" color="blue" status="open" : What? -->
<!-- REVIEW_RESPONSE to="q1" -->
The AI answer.
<!-- /REVIEW_RESPONSE -->`

    const parts = splitDocument(input)
    const output = mergeDocument(parts)

    expect(output).toContain('<!-- REVIEW_RESPONSE to="q1" -->')
    expect(output).toContain('The AI answer.')
    expect(output).toContain('<!-- /REVIEW_RESPONSE -->')
  })

  it('roundtrip preserves memos inside response', () => {
    const input = `Anchor line.
<!-- REVIEW_RESPONSE to="q1" -->
First sentence of answer.
<!-- USER_MEMO id="m2" color="red" status="open" : Fix this -->
Second sentence.
<!-- /REVIEW_RESPONSE -->`

    const parts = splitDocument(input)
    const output = mergeDocument(parts)

    expect(output).toContain('<!-- REVIEW_RESPONSE to="q1" -->')
    expect(output).toContain('First sentence of answer.')
    expect(output).toContain('USER_MEMO')
    expect(output).toContain('m2')
    expect(output).toContain('Second sentence.')
    expect(output).toContain('<!-- /REVIEW_RESPONSE -->')
  })

  it('roundtrip with 3 annotations inside response', () => {
    const input = `Anchor.
<!-- REVIEW_RESPONSE to="q1" -->
Point one.
<!-- USER_MEMO id="a1" color="red" status="open" : fix1 -->
Point two.
<!-- USER_MEMO id="a2" color="blue" status="open" : question1 -->
Point three.
<!-- USER_MEMO id="a3" color="yellow" status="open" : highlight1 -->
<!-- /REVIEW_RESPONSE -->`

    const parts = splitDocument(input)

    expect(parts.responses).toHaveLength(1)
    expect(parts.memos).toHaveLength(3)

    const output = mergeDocument(parts)

    expect(output).toContain('<!-- REVIEW_RESPONSE to="q1" -->')
    expect(output).toContain('<!-- /REVIEW_RESPONSE -->')
    expect(output).toContain('fix1')
    expect(output).toContain('question1')
    expect(output).toContain('highlight1')
  })

  it('roundtrip with sequential (flat) responses', () => {
    const input = `Question 1.
<!-- USER_MEMO id="q1" color="blue" status="open" : First question -->
<!-- REVIEW_RESPONSE to="q1" -->
Answer to first question.
<!-- /REVIEW_RESPONSE -->
Follow-up.
<!-- USER_MEMO id="q2" color="blue" status="open" : Second question -->
<!-- REVIEW_RESPONSE to="q2" -->
Answer to second question.
<!-- /REVIEW_RESPONSE -->`

    const parts = splitDocument(input)

    expect(parts.responses).toHaveLength(2)
    expect(parts.memos).toHaveLength(2)

    const output = mergeDocument(parts)

    expect(output).toContain('<!-- REVIEW_RESPONSE to="q1" -->')
    expect(output).toContain('Answer to first question.')
    expect(output).toContain('<!-- REVIEW_RESPONSE to="q2" -->')
    expect(output).toContain('Answer to second question.')
  })
})

describe('B-10: convertMemosToHtml with REVIEW_RESPONSE', () => {
  it('converts REVIEW_RESPONSE markers to div tags', () => {
    const input = `Some text.
<!-- REVIEW_RESPONSE to="q1" -->
AI answer content.
<!-- /REVIEW_RESPONSE -->`

    const html = convertMemosToHtml(input)

    expect(html).toContain('<div data-review-response data-response-to="q1">')
    expect(html).toContain('AI answer content.')
    expect(html).toContain('</div>')
    expect(html).not.toContain('REVIEW_RESPONSE')
  })

  it('converts REVIEW_RESPONSE with memo inside', () => {
    const input = `Anchor.
<!-- REVIEW_RESPONSE to="q1" -->
Answer text.
<!-- USER_MEMO id="m2" color="red" status="open" : Fix needed -->
More answer.
<!-- /REVIEW_RESPONSE -->`

    const html = convertMemosToHtml(input)

    expect(html).toContain('data-review-response')
    expect(html).toContain('data-memo-id="m2"')
    expect(html).toContain('Answer text.')
    expect(html).toContain('More answer.')
  })
})

describe('Auto-status: REVIEW_RESPONSE → needs_review', () => {
  it('auto-escalates open memo with REVIEW_RESPONSE to needs_review', () => {
    const input = `# Plan

Some text.
<!-- USER_MEMO id="q1" color="blue" status="open" : What does this mean? -->
<!-- REVIEW_RESPONSE to="q1" -->
This is the AI answer.
<!-- /REVIEW_RESPONSE -->`

    const parts = splitDocument(input)

    expect(parts.memos).toHaveLength(1)
    expect(parts.memos[0].status).toBe('needs_review')
  })

  it('preserves "done" status (v1.1+ valid status)', () => {
    const input = `Some text.
<!-- USER_MEMO
  id="q1"
  type="fix"
  status="done"
  owner="human"
  source="generic"
  color="red"
  text="Fix this"
  anchorText="Some text."
  anchor=""
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->
<!-- REVIEW_RESPONSE to="q1" -->
Fixed it.
<!-- /REVIEW_RESPONSE -->`

    const parts = splitDocument(input)

    expect(parts.memos).toHaveLength(1)
    expect(parts.memos[0].status).toBe('done')
  })

  it('preserves wontfix status even with REVIEW_RESPONSE', () => {
    const input = `Some text.
<!-- USER_MEMO
  id="q1"
  type="question"
  status="wontfix"
  owner="human"
  source="generic"
  color="blue"
  text="Why?"
  anchorText="Some text."
  anchor=""
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->
<!-- REVIEW_RESPONSE to="q1" -->
Not applicable.
<!-- /REVIEW_RESPONSE -->`

    const parts = splitDocument(input)

    expect(parts.memos).toHaveLength(1)
    expect(parts.memos[0].status).toBe('wontfix')
  })

  it('keeps open status for memos without REVIEW_RESPONSE', () => {
    const input = `Some text.
<!-- USER_MEMO id="q1" color="blue" status="open" : Unanswered question -->
Other text.
<!-- USER_MEMO id="q2" color="red" status="open" : Fix needed -->
<!-- REVIEW_RESPONSE to="q2" -->
Here is the fix.
<!-- /REVIEW_RESPONSE -->`

    const parts = splitDocument(input)

    expect(parts.memos).toHaveLength(2)
    const q1 = parts.memos.find(m => m.id === 'q1')!
    const q2 = parts.memos.find(m => m.id === 'q2')!
    expect(q1.status).toBe('open')
    expect(q2.status).toBe('needs_review')
  })
})
