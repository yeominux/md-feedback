import { describe, it, expect } from 'vitest'
import { validateCommentIntegrity, repairNestedComments } from '../document-writer'

describe('validateCommentIntegrity', () => {
  it('returns valid for a document with sequential (non-nested) comments', () => {
    const md = `# Title

Some content.
<!-- USER_MEMO id="m1" color="red" status="open" : Fix this -->
More content.
<!-- GATE
  id="gate_1"
  type="custom"
  status="blocked"
  blockedBy="m1"
  canProceedIf="All clear"
  doneDefinition="Addressed"
-->`

    const result = validateCommentIntegrity(md)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('detects nested comment (<!-- inside <!--...-->)', () => {
    const md = `# Title

<!-- outer comment start
  some text
  <!-- USER_MEMO id="m1" : nested -->
  more text
-->`

    const result = validateCommentIntegrity(md)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(1)
    expect(result.errors[0]).toMatch(/Nested comment at line 5/)
  })

  it('detects unclosed comment (<!-- without -->)', () => {
    const md = `# Title

Some content.
<!-- This comment is never closed
More content here.`

    const result = validateCommentIntegrity(md)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Unclosed comment'))).toBe(true)
  })

  it('ignores <!-- inside fenced code blocks', () => {
    const md = `# Title

\`\`\`html
<!-- This is inside a code block and should be ignored -->
<!-- Even unclosed ones
\`\`\`

Normal content.`

    const result = validateCommentIntegrity(md)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('handles single-line self-contained comments correctly', () => {
    const md = `# Title

<!-- single line comment -->
<!-- another single line -->
Content here.`

    const result = validateCommentIntegrity(md)
    expect(result.valid).toBe(true)
  })

  it('validates multi-line USER_MEMO blocks as valid', () => {
    const md = `# Title

Content line
<!-- USER_MEMO
  id="m1"
  type="fix"
  status="open"
  owner="human"
  source="generic"
  color="red"
  text="Fix this"
  anchorText="Content line"
  anchor="L3|abcdef01"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->`

    const result = validateCommentIntegrity(md)
    expect(result.valid).toBe(true)
  })

  it('reports correct line numbers for nested comment errors', () => {
    const md = `Line 1
Line 2
<!-- outer opens at line 3
Line 4
<!-- nested at line 5
Line 6
-->`

    const result = validateCommentIntegrity(md)
    expect(result.valid).toBe(false)
    // Should reference line 5 as nested and line 3 as outer
    expect(result.errors[0]).toContain('line 5')
    expect(result.errors[0]).toContain('line 3')
  })
})

describe('repairNestedComments', () => {
  it('extracts nested USER_MEMO from outer comment and passes re-validation', () => {
    const md = `# Title

<!-- outer comment
  text inside outer
  <!-- USER_MEMO
    id="m1"
    type="fix"
  -->
  after nested
-->`

    const repaired = repairNestedComments(md)
    // Should return non-null (repair successful)
    expect(repaired).not.toBeNull()

    // Repaired markdown should pass validation
    const check = validateCommentIntegrity(repaired!)
    expect(check.valid).toBe(true)

    // Should contain the extracted USER_MEMO
    expect(repaired).toContain('USER_MEMO')
  })

  it('returns null when no nested comments to repair', () => {
    const md = `# Title

<!-- normal comment -->
Content.`

    const repaired = repairNestedComments(md)
    expect(repaired).toBeNull()
  })

  it('returns null when repair cannot fix the issue', () => {
    // Complex nesting that repair logic can't handle
    const md = `# Title

<!-- outer
  <!-- inner1
    <!-- inner2
    -->
  -->
-->`

    const repaired = repairNestedComments(md)
    // Either null or valid — if repair succeeds, it should validate
    if (repaired !== null) {
      const check = validateCommentIntegrity(repaired)
      expect(check.valid).toBe(true)
    }
  })
})
