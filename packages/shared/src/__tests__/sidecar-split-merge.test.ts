import { describe, it, expect } from 'vitest'
import { mergeDocument, mergeDocumentWithSidecar, splitDocument } from '../document-writer'
import type { DocumentParts, SidecarMetadata } from '../types'

function sampleParts(): DocumentParts {
  return {
    frontmatter: '---\ntitle: test\n---\n',
    body: 'Anchor line\n',
    memos: [
      {
        id: 'm1',
        type: 'fix',
        status: 'open',
        owner: 'human',
        source: 'generic',
        color: 'red',
        text: 'Fix this',
        anchorText: 'Anchor line',
        anchor: 'L1|abcd1234',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    responses: [],
    impls: [
      {
        id: 'impl_inline',
        memoId: 'm1',
        status: 'applied',
        operations: [{ type: 'text_replace', file: '', before: 'A', after: 'B' }],
        summary: 'inline impl',
        appliedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    artifacts: [
      {
        id: 'art_inline',
        memoId: 'm1',
        files: ['src/a.ts'],
        linkedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    dependencies: [
      {
        id: 'dep_inline',
        from: 'm1',
        to: 'm2',
        type: 'related',
      },
    ],
    checkpoints: [
      {
        id: 'ckpt_inline',
        timestamp: '2026-01-01T00:00:00.000Z',
        note: 'checkpoint',
        fixes: 1,
        questions: 0,
        highlights: 0,
        sectionsReviewed: ['Section A'],
      },
    ],
    gates: [
      {
        id: 'gate_1',
        type: 'custom',
        status: 'blocked',
        blockedBy: ['m1'],
        canProceedIf: 'done',
        doneDefinition: 'all done',
      },
    ],
    cursor: {
      taskId: 'task-1',
      step: '1/2',
      nextAction: 'Do thing',
      lastSeenHash: 'abcd1234',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  }
}

describe('splitDocument(markdown, sidecar?)', () => {
  it('merges sidecar metadata while keeping inline entries on ID collision', () => {
    const markdown = mergeDocument(sampleParts())
    const sidecar: SidecarMetadata = {
      version: '1.0',
      updatedAt: '2026-01-02T00:00:00.000Z',
      impls: [
        {
          id: 'impl_inline',
          memoId: 'm1',
          status: 'failed',
          operations: [{ type: 'text_replace', file: '', before: 'X', after: 'Y' }],
          summary: 'sidecar conflicting impl',
          appliedAt: '2026-01-02T00:00:00.000Z',
        },
        {
          id: 'impl_sidecar_only',
          memoId: 'm1',
          status: 'applied',
          operations: [{ type: 'text_replace', file: '', before: 'B', after: 'C' }],
          summary: 'sidecar impl',
          appliedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      artifacts: [
        { id: 'art_inline', memoId: 'm1', files: ['src/sidecar.ts'], linkedAt: '2026-01-02T00:00:00.000Z' },
        { id: 'art_sidecar_only', memoId: 'm1', files: ['src/b.ts'], linkedAt: '2026-01-02T00:00:00.000Z' },
      ],
      dependencies: [
        { id: 'dep_inline', from: 'mX', to: 'mY', type: 'blocks' },
        { id: 'dep_sidecar_only', from: 'm1', to: 'm3', type: 'related' },
      ],
      checkpoints: [
        {
          id: 'ckpt_inline',
          timestamp: '2026-01-02T00:00:00.000Z',
          note: 'sidecar conflicting checkpoint',
          fixes: 9,
          questions: 9,
          highlights: 9,
          sectionsReviewed: ['Sidecar'],
        },
        {
          id: 'ckpt_sidecar_only',
          timestamp: '2026-01-02T00:00:00.000Z',
          note: 'sidecar checkpoint',
          fixes: 1,
          questions: 1,
          highlights: 0,
          sectionsReviewed: ['B'],
        },
      ],
    }

    const parsed = splitDocument(markdown, sidecar)

    expect(parsed.impls.map(x => x.id)).toEqual(['impl_inline', 'impl_sidecar_only'])
    expect(parsed.impls.find(x => x.id === 'impl_inline')?.summary).toBe('inline impl')

    expect(parsed.artifacts.map(x => x.id)).toEqual(['art_inline', 'art_sidecar_only'])
    expect(parsed.artifacts.find(x => x.id === 'art_inline')?.files).toEqual(['src/a.ts'])

    expect(parsed.dependencies.map(x => x.id)).toEqual(['dep_inline', 'dep_sidecar_only'])
    expect(parsed.dependencies.find(x => x.id === 'dep_inline')?.from).toBe('m1')

    expect(parsed.checkpoints.map(x => x.id)).toEqual(['ckpt_inline', 'ckpt_sidecar_only'])
    expect(parsed.checkpoints.find(x => x.id === 'ckpt_inline')?.note).toBe('checkpoint')
  })
})

describe('mergeDocumentWithSidecar', () => {
  it('returns markdown without heavy metadata and keeps PLAN_CURSOR inline', () => {
    const result = mergeDocumentWithSidecar(sampleParts())
    expect(result.sidecar).not.toBeNull()
    expect(result.markdown).toContain('<!-- USER_MEMO')
    expect(result.markdown).toContain('<!-- GATE')
    expect(result.markdown).toContain('<!-- PLAN_CURSOR')
    expect(result.markdown).not.toContain('<!-- MEMO_IMPL')
    expect(result.markdown).not.toContain('<!-- MEMO_ARTIFACT')
    expect(result.markdown).not.toContain('<!-- MEMO_DEPENDENCY')
    expect(result.markdown).not.toContain('<!-- CHECKPOINT')
    expect(result.sidecar?.impls.map(x => x.id)).toEqual(['impl_inline'])
    expect(result.sidecar?.artifacts.map(x => x.id)).toEqual(['art_inline'])
    expect(result.sidecar?.dependencies.map(x => x.id)).toEqual(['dep_inline'])
    expect(result.sidecar?.checkpoints.map(x => x.id)).toEqual(['ckpt_inline'])
  })

  it('returns sidecar: null when no heavy metadata exists', () => {
    const parts = sampleParts()
    parts.impls = []
    parts.artifacts = []
    parts.dependencies = []
    parts.checkpoints = []
    const result = mergeDocumentWithSidecar(parts)
    expect(result.sidecar).toBeNull()
    expect(result.markdown).toContain('<!-- USER_MEMO')
    expect(result.markdown).toContain('<!-- GATE')
    expect(result.markdown).toContain('<!-- PLAN_CURSOR')
  })

  it('supports migration roundtrip (all-inline -> split+sidecar merge)', () => {
    const originalMarkdown = mergeDocument(sampleParts())
    const parsedOld = splitDocument(originalMarkdown)
    const merged = mergeDocumentWithSidecar(parsedOld)
    const parsedNew = splitDocument(merged.markdown, merged.sidecar)

    expect(parsedNew.impls.map(x => x.id).sort()).toEqual(parsedOld.impls.map(x => x.id).sort())
    expect(parsedNew.artifacts.map(x => x.id).sort()).toEqual(parsedOld.artifacts.map(x => x.id).sort())
    expect(parsedNew.dependencies.map(x => x.id).sort()).toEqual(parsedOld.dependencies.map(x => x.id).sort())
    expect(parsedNew.checkpoints.map(x => x.id).sort()).toEqual(parsedOld.checkpoints.map(x => x.id).sort())
    expect(parsedNew.cursor?.taskId).toBe(parsedOld.cursor?.taskId)
  })
})

