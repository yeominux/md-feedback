import { describe, expect, it, vi } from 'vitest'
import { mergeDocument, type DocumentParts, type Gate, type MemoV2 } from '@md-feedback/shared'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { tmpdir } from 'node:os'
const SAFE_TMPDIR = (() => {
  const t = tmpdir()
  if (!/[^\x00-\x7F]/.test(t)) return t
  return process.platform === 'win32' ? 'C:\\Windows\\Temp' : '/tmp'
})()

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

  it('includes workflow and blocking metadata from sidecar files', () => {
    const workspace = mkdtempSync(join(SAFE_TMPDIR,'md-feedback-docsync-'))
    const mdFile = join(workspace, 'plan.md')
    const sidecar = join(workspace, '.md-feedback')
    mkdirSync(sidecar, { recursive: true })
    writeFileSync(mdFile, '# Title\nAnchor\n', 'utf-8')
    writeFileSync(
      join(sidecar, 'workflow.json'),
      JSON.stringify({
        version: '1.0',
        phase: 'implementation',
        pendingCheckpoint: { id: 'chk_1', tool: 'batch_apply', reason: 'risk', requestedAt: '2026-02-19T00:00:00.000Z' },
      }),
      'utf-8',
    )

    const gate: Gate = {
      id: 'gate-1',
      type: 'merge',
      status: 'blocked',
      blockedBy: ['memo-1'],
      canProceedIf: '',
      doneDefinition: 'All review annotations resolved',
    }
    const raw = buildRaw('open', gate)
    const postMessage = vi.fn()

    ;(vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = {
      document: {
        languageId: 'markdown',
        uri: { fsPath: mdFile },
      },
    }

    try {
      sendStatusInfo(raw, postMessage)
      const summaryMsg = postMessage.mock.calls.find(call => call[0]?.type === 'status.summary')?.[0]
      const metadataMsg = postMessage.mock.calls.find(call => call[0]?.type === 'metadata.update')?.[0]

      expect(summaryMsg.summary.workflowPhase).toBe('implementation')
      expect(summaryMsg.summary.approvalRequired).toBe(true)
      expect(summaryMsg.summary.unresolvedBlockingCount).toBe(1)
      expect(metadataMsg.unresolvedBlockingMemos).toEqual(['memo-1'])
    } finally {
      ;(vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = undefined
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('uses provided source document sidecar when active editor is unavailable', () => {
    const workspace = mkdtempSync(join(SAFE_TMPDIR,'md-feedback-docsync-srcdoc-'))
    const mdFile = join(workspace, 'plan.md')
    const sidecar = join(workspace, '.md-feedback')
    mkdirSync(sidecar, { recursive: true })
    writeFileSync(mdFile, '# Title\nAnchor\n', 'utf-8')
    writeFileSync(
      join(sidecar, 'workflow.json'),
      JSON.stringify({
        version: '1.0',
        phase: 'verification',
        pendingCheckpoint: { id: 'chk_2', tool: 'rollback_memo', reason: 'risk', requestedAt: '2026-02-19T00:00:00.000Z' },
      }),
      'utf-8',
    )

    const gate: Gate = {
      id: 'gate-1',
      type: 'merge',
      status: 'blocked',
      blockedBy: ['memo-1'],
      canProceedIf: '',
      doneDefinition: 'All review annotations resolved',
    }
    const raw = buildRaw('open', gate)
    const postMessage = vi.fn()
    const sourceDocument = {
      uri: { fsPath: mdFile },
      languageId: 'markdown',
    } as unknown as import('vscode').TextDocument

    ;(vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = undefined

    try {
      sendStatusInfo(raw, postMessage, undefined, undefined, undefined, sourceDocument)
      const summaryMsg = postMessage.mock.calls.find(call => call[0]?.type === 'status.summary')?.[0]
      expect(summaryMsg.summary.workflowPhase).toBe('verification')
      expect(summaryMsg.summary.approvalRequired).toBe(true)
      expect(summaryMsg.summary.pendingApprovalTool).toBe('rollback_memo')
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('parses workflow sidecar with UTF-8 BOM and keeps approvalRequired visible', () => {
    const workspace = mkdtempSync(join(SAFE_TMPDIR,'md-feedback-docsync-bom-'))
    const mdFile = join(workspace, 'plan.md')
    const sidecar = join(workspace, '.md-feedback')
    mkdirSync(sidecar, { recursive: true })
    writeFileSync(mdFile, '# Title\nAnchor\n', 'utf-8')
    writeFileSync(
      join(sidecar, 'workflow.json'),
      '\uFEFF' + JSON.stringify({
        version: '1.0',
        phase: 'verification',
        pendingCheckpoint: { id: 'chk_bom', tool: 'batch_apply', reason: 'risk', requestedAt: '2026-02-19T00:00:00.000Z' },
      }),
      'utf-8',
    )

    const gate: Gate = {
      id: 'gate-1',
      type: 'merge',
      status: 'blocked',
      blockedBy: ['memo-1'],
      canProceedIf: '',
      doneDefinition: 'All review annotations resolved',
    }
    const raw = buildRaw('open', gate)
    const postMessage = vi.fn()
    const sourceDocument = {
      uri: { fsPath: mdFile },
      languageId: 'markdown',
    } as unknown as import('vscode').TextDocument

    try {
      sendStatusInfo(raw, postMessage, undefined, undefined, undefined, sourceDocument)
      const summaryMsg = postMessage.mock.calls.find(call => call[0]?.type === 'status.summary')?.[0]
      expect(summaryMsg.summary.workflowPhase).toBe('verification')
      expect(summaryMsg.summary.approvalRequired).toBe(true)
      expect(summaryMsg.summary.pendingApprovalTool).toBe('batch_apply')
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
