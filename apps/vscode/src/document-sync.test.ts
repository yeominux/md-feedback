import { describe, expect, it, vi } from 'vitest'
import { mergeDocument, type DocumentParts, type Gate, type MemoV2 } from '@md-feedback/shared'

vi.mock('vscode', () => ({
  window: {
    activeTextEditor: undefined,
    showInformationMessage: vi.fn(),
  },
  workspace: {
    asRelativePath: vi.fn(() => 'docs/plan.md'),
  },
}))

import * as vscode from 'vscode'
import { sendStatusInfo } from './document-sync'

function buildRaw(memoStatus: MemoV2['status'], gate: Gate): string {
  const memo: MemoV2 = {
    id: 'memo-1',
    type: 'fix',
    status: memoStatus,
    owner: 'agent',
    source: 'mcp',
    color: 'red',
    text: 'Fix this',
    anchorText: 'Anchor',
    anchor: 'L1|12345678',
    createdAt: '2026-02-19T00:00:00.000Z',
    updatedAt: '2026-02-19T00:00:00.000Z',
  }
  const parts: DocumentParts = {
    frontmatter: '',
    body: '# Title\nAnchor\n',
    memos: [memo],
    responses: [],
    impls: [],
    artifacts: [],
    dependencies: [],
    checkpoints: [],
    gates: [gate],
    cursor: null,
  }
  return mergeDocument(parts)
}

describe('document-sync sendStatusInfo', () => {
  it('posts status summary and needs_review count', () => {
    const gate: Gate = {
      id: 'gate-1',
      type: 'merge',
      status: 'blocked',
      blockedBy: ['memo-1'],
      canProceedIf: '',
      doneDefinition: 'All review annotations resolved',
    }
    const raw = buildRaw('needs_review', gate)
    const postMessage = vi.fn()
    const onNeedsReviewCount = vi.fn()

    sendStatusInfo(raw, postMessage, undefined, undefined, onNeedsReviewCount)

    const summaryMsg = postMessage.mock.calls.find(call => call[0]?.type === 'status.summary')?.[0]
    expect(summaryMsg).toBeDefined()
    expect(summaryMsg.summary).toMatchObject({
      totalMemos: 1,
      openFixes: 0,
      needsReviewMemos: 1,
      gateStatus: 'blocked',
    })
    expect(onNeedsReviewCount).toHaveBeenCalledWith(1)
  })

  it('shows toast when gate transitions from blocked to done', () => {
    const gate: Gate = {
      id: 'gate-1',
      type: 'merge',
      status: 'blocked',
      blockedBy: ['memo-1'],
      canProceedIf: '',
      doneDefinition: 'All review annotations resolved',
    }
    const prevStatuses = new Map<string, string>([['gate-1', 'blocked']])
    const getPreviousGateStatuses = () => prevStatuses
    const setPreviousGateStatuses = (next: Map<string, string>) => {
      prevStatuses.clear()
      for (const [k, v] of next.entries()) prevStatuses.set(k, v)
    }
    const postMessage = vi.fn()

    const raw = buildRaw('done', gate)
    sendStatusInfo(raw, postMessage, getPreviousGateStatuses, setPreviousGateStatuses)

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Gate "gate-1" is now done',
      'Open Document',
    )
    expect(prevStatuses.get('gate-1')).toBe('done')
  })
})
