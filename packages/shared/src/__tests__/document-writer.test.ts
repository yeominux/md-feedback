import { describe, it, expect } from 'vitest'
import { splitDocument, mergeDocument } from '../index'

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
})
