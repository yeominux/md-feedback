/**
 * v0.3 → v0.4 Format Transition Integration Test
 *
 * Simulates the real-world scenario:
 *   Extension creates v0.3 annotations → MCP modifies (mergeDocument rewrites to v0.4)
 *   → All downstream functions still work correctly.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import {
  splitDocument,
  mergeDocument,
  getAnnotationCounts,
  extractMemos,
  extractMemosV2,
  convertMemosToHtml,
  buildHandoffDocument,
  evaluateGate,
  evaluateAllGates,
} from '../index'

// ─── Test fixtures ───

/** Document with v0.3 single-line memos (as created by the VS Code Extension) */
const V03_DOCUMENT = `# Architecture Plan

## API Design

The REST API should use JSON:API format.
<!-- USER_MEMO id="m1" color="red" status="open" : Change to GraphQL instead -->

Rate limiting should be 100 req/s per client.
<!-- USER_MEMO id="m2" color="blue" status="open" : Is 100 enough for enterprise? -->

## Database

Use PostgreSQL for persistent storage.
<!-- USER_MEMO id="m3" color="yellow" status="open" : Good choice -->

Cache layer uses Redis.
<!-- USER_MEMO id="m4" color="red" status="open" : Consider Valkey as Redis alternative -->
`

/** Same document after MCP mergeDocument() rewrites memos to v0.4 multi-line format */
function simulateMcpEdit(markdown: string): string {
  const parts = splitDocument(markdown)
  // mergeDocument always serializes memos in v0.4 format
  return mergeDocument(parts)
}

/** Document with mixed v0.3 + v0.4 memos (Extension adds new v0.3 memo to v0.4 document) */
function createMixedDocument(): string {
  const v04doc = simulateMcpEdit(V03_DOCUMENT)
  // Extension appends a new v0.3 memo after the last body line
  const lines = v04doc.split('\n')
  const insertIdx = lines.findIndex(l => l.includes('Cache layer uses Redis'))
  // Insert v0.3 memo right after the Redis line
  lines.splice(insertIdx + 1, 0,
    '<!-- USER_MEMO id="m5" color="blue" status="open" : What about Memcached? -->')
  return lines.join('\n')
}

// ─── Integration Tests ───

describe('v0.3 → v0.4 transition integration', () => {

  // ── Phase 1: v0.3 only (Extension-created document) ──

  describe('Phase 1: v0.3 format only', () => {
    it('splitDocument parses all v0.3 memos', () => {
      const parts = splitDocument(V03_DOCUMENT)
      expect(parts.memos).toHaveLength(4)
      expect(parts.memos.map(m => m.id)).toEqual(['m1', 'm2', 'm3', 'm4'])
      expect(parts.memos[0].color).toBe('red')
      expect(parts.memos[1].color).toBe('blue')
      expect(parts.memos[2].color).toBe('yellow')
      expect(parts.memos[3].color).toBe('red')
    })

    it('getAnnotationCounts returns correct counts for v0.3', () => {
      const counts = getAnnotationCounts(V03_DOCUMENT)
      expect(counts.fixes).toBe(2)
      expect(counts.questions).toBe(1)
      expect(counts.highlights).toBe(1)
    })

    it('extractMemos returns all v0.3 memos', () => {
      const { memos } = extractMemos(V03_DOCUMENT)
      expect(memos).toHaveLength(4)
      expect(memos[0].text).toBe('Change to GraphQL instead')
      expect(memos[1].text).toBe('Is 100 enough for enterprise?')
    })

    it('convertMemosToHtml converts all v0.3 memos to memo-block HTML', () => {
      const html = convertMemosToHtml(V03_DOCUMENT)
      expect(html).toContain('data-memo-id="m1"')
      expect(html).toContain('data-memo-id="m2"')
      expect(html).toContain('data-memo-id="m3"')
      expect(html).toContain('data-memo-id="m4"')
      expect(html).toContain('data-memo-color="red"')
      expect(html).toContain('data-memo-color="blue"')
      expect(html).toContain('data-memo-color="yellow"')
    })

    it('buildHandoffDocument collects all v0.3 annotated items', () => {
      const doc = buildHandoffDocument(V03_DOCUMENT, 'test.md')
      expect(doc.decisions).toHaveLength(2)   // 2 red (fix)
      expect(doc.openQuestions).toHaveLength(1) // 1 blue (question)
      expect(doc.keyPoints).toHaveLength(1)     // 1 yellow (highlight)
    })
  })

  // ── Phase 2: v0.4 only (after MCP mergeDocument) ──

  describe('Phase 2: v0.4 format only (after MCP edit)', () => {
    let v04Document: string

    beforeAll(() => {
      v04Document = simulateMcpEdit(V03_DOCUMENT)
    })

    it('mergeDocument converts v0.3 → v0.4 format', () => {
      // v0.4 format has multi-line memos
      expect(v04Document).toContain('<!-- USER_MEMO\n')
      expect(v04Document).toContain('  id="m1"')
      // Should NOT contain v0.3 single-line format
      expect(v04Document).not.toMatch(/<!-- USER_MEMO id="m1"[^>]*-->/)
    })

    it('splitDocument parses all v0.4 memos', () => {
      const parts = splitDocument(v04Document)
      expect(parts.memos).toHaveLength(4)
      expect(parts.memos.map(m => m.id)).toEqual(['m1', 'm2', 'm3', 'm4'])
    })

    it('getAnnotationCounts returns correct counts for v0.4', () => {
      const counts = getAnnotationCounts(v04Document)
      expect(counts.fixes).toBe(2)
      expect(counts.questions).toBe(1)
      expect(counts.highlights).toBe(1)
    })

    it('extractMemos returns all v0.4 memos', () => {
      const { memos } = extractMemos(v04Document)
      expect(memos).toHaveLength(4)
      expect(memos[0].text).toBe('Change to GraphQL instead')
    })

    it('extractMemosV2 returns all v0.4 memos with full metadata', () => {
      const { memos } = extractMemosV2(v04Document)
      expect(memos).toHaveLength(4)
      expect(memos[0].type).toBe('fix')
      expect(memos[1].type).toBe('question')
      expect(memos[2].type).toBe('highlight')
    })

    it('convertMemosToHtml converts all v0.4 memos to memo-block HTML', () => {
      const html = convertMemosToHtml(v04Document)
      expect(html).toContain('data-memo-id="m1"')
      expect(html).toContain('data-memo-id="m2"')
      expect(html).toContain('data-memo-id="m3"')
      expect(html).toContain('data-memo-id="m4"')
    })

    it('buildHandoffDocument collects all v0.4 annotated items', () => {
      const doc = buildHandoffDocument(v04Document, 'test.md')
      expect(doc.decisions).toHaveLength(2)
      expect(doc.openQuestions).toHaveLength(1)
      expect(doc.keyPoints).toHaveLength(1)
    })
  })

  // ── Phase 3: Mixed v0.3 + v0.4 (Extension adds new memo to MCP-edited doc) ──

  describe('Phase 3: mixed v0.3 + v0.4', () => {
    let mixedDocument: string

    beforeAll(() => {
      mixedDocument = createMixedDocument()
    })

    it('splitDocument parses both v0.3 and v0.4 memos', () => {
      const parts = splitDocument(mixedDocument)
      expect(parts.memos).toHaveLength(5)
      const ids = parts.memos.map(m => m.id)
      expect(ids).toContain('m1')
      expect(ids).toContain('m5')
    })

    it('getAnnotationCounts counts both formats', () => {
      const counts = getAnnotationCounts(mixedDocument)
      expect(counts.fixes).toBe(2)
      expect(counts.questions).toBe(2) // m2 + m5
      expect(counts.highlights).toBe(1)
    })

    it('extractMemos returns memos from both formats', () => {
      const { memos } = extractMemos(mixedDocument)
      expect(memos).toHaveLength(5)
    })

    it('convertMemosToHtml handles both formats', () => {
      const html = convertMemosToHtml(mixedDocument)
      expect(html).toContain('data-memo-id="m1"')
      expect(html).toContain('data-memo-id="m5"')
    })
  })

  // ── Phase 4: Full roundtrip stability ──

  describe('Phase 4: roundtrip stability', () => {
    it('double roundtrip preserves all memos', () => {
      // v0.3 → split → merge (v0.4) → split → merge (v0.4) → split
      const parts1 = splitDocument(V03_DOCUMENT)
      expect(parts1.memos).toHaveLength(4)

      const merged1 = mergeDocument(parts1)
      const parts2 = splitDocument(merged1)
      expect(parts2.memos).toHaveLength(4)

      const merged2 = mergeDocument(parts2)
      const parts3 = splitDocument(merged2)
      expect(parts3.memos).toHaveLength(4)

      // All memo IDs preserved
      expect(parts3.memos.map(m => m.id)).toEqual(parts1.memos.map(m => m.id))
    })

    it('memo text survives roundtrip without corruption', () => {
      const parts1 = splitDocument(V03_DOCUMENT)
      const merged = mergeDocument(parts1)
      const parts2 = splitDocument(merged)

      for (let i = 0; i < parts1.memos.length; i++) {
        expect(parts2.memos[i].text).toBe(parts1.memos[i].text)
        expect(parts2.memos[i].color).toBe(parts1.memos[i].color)
      }
    })

    it('body content preserved through roundtrip', () => {
      const parts1 = splitDocument(V03_DOCUMENT)
      const merged = mergeDocument(parts1)
      const parts2 = splitDocument(merged)

      expect(parts2.body).toBe(parts1.body)
    })
  })

  // ── Phase 5: Gate evaluation works with both formats ──

  describe('Phase 5: gate evaluation with format transition', () => {
    it('gate blocked by v0.3 memos evaluates correctly after v0.4 conversion', () => {
      const parts = splitDocument(V03_DOCUMENT)

      // Create gate blocked by m1
      const gate = {
        id: 'gate-test',
        type: 'merge' as const,
        status: 'blocked' as const,
        blockedBy: ['m1'],
        canProceedIf: '',
        doneDefinition: 'All fixes resolved',
      }

      // v0.3 memos — m1 is open → blocked
      expect(evaluateGate(gate, parts.memos)).toBe('blocked')

      // Convert to v0.4 and re-evaluate
      const merged = mergeDocument({ ...parts, gates: [gate] })
      const parts2 = splitDocument(merged)

      expect(evaluateGate(gate, parts2.memos)).toBe('blocked')

      // Resolve m1
      const resolvedMemos = parts2.memos.map(m =>
        m.id === 'm1' ? { ...m, status: 'done' as const } : m,
      )
      expect(evaluateGate(gate, resolvedMemos)).toBe('proceed')
    })
  })

  // ── Phase 6: Edge cases ──

  describe('Phase 6: edge cases', () => {
    it('empty document — no memos', () => {
      const parts = splitDocument('')
      expect(parts.memos).toEqual([])
      const counts = getAnnotationCounts('')
      expect(counts.fixes).toBe(0)
    })

    it('memo text with special characters survives roundtrip', () => {
      const doc = `# Plan

Review this carefully.
<!-- USER_MEMO id="sp1" color="red" status="open" : Use "quotes" and <angle> brackets -->`

      const parts = splitDocument(doc)
      expect(parts.memos).toHaveLength(1)
      expect(parts.memos[0].text).toContain('"quotes"')

      const merged = mergeDocument(parts)
      const parts2 = splitDocument(merged)
      expect(parts2.memos).toHaveLength(1)
      // Special chars are escaped in v0.4 serialization via &quot; etc.
      expect(parts2.memos[0].text).toContain('quotes')
    })

    it('table-embedded memo (B-1) handled in convertMemosToHtml', () => {
      const doc = `| Header 1 | Header 2 |
|----------|----------|
| cell text <!-- USER_MEMO id="tm1" color="red" status="open" : table fix --> | other |
| normal | row |`

      const html = convertMemosToHtml(doc)
      expect(html).toContain('data-memo-id="tm1"')
      expect(html).toContain('data-memo-color="red"')
    })
  })
})
