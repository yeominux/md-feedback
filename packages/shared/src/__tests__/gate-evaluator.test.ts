import { describe, it, expect } from 'vitest'
import { evaluateGate, evaluateAllGates } from '../index'
import type { Gate, MemoV2 } from '../index'

describe('gate-evaluator — evaluateGate and evaluateAllGates', () => {
  it('returns done when gate has no blockers and no open memos', () => {
    const gate: Gate = {
      id: 'gate-1',
      type: 'merge',
      status: 'blocked',
      blockedBy: [],
      canProceedIf: 'all fixes addressed',
      doneDefinition: 'all memos resolved',
    }
    const memos: MemoV2[] = []

    const status = evaluateGate(gate, memos)
    expect(status).toBe('done')
  })

  it('returns blocked when gate has blocking memo that is open', () => {
    const gate: Gate = {
      id: 'gate-1',
      type: 'merge',
      status: 'proceed',
      blockedBy: ['m1'],
      canProceedIf: 'all fixes addressed',
      doneDefinition: 'all memos resolved',
    }
    const memos: MemoV2[] = [
      {
        id: 'm1',
        type: 'fix',
        status: 'open',
        owner: 'human',
        source: 'cursor',
        color: 'red',
        text: 'Fix this',
        anchorText: 'Some text',
        anchor: 'L1:L1|abc123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ]

    const status = evaluateGate(gate, memos)
    expect(status).toBe('blocked')
  })

  it('returns proceed when gate has blocking memo that is done', () => {
    const gate: Gate = {
      id: 'gate-1',
      type: 'merge',
      status: 'blocked',
      blockedBy: ['m1'],
      canProceedIf: 'all fixes addressed',
      doneDefinition: 'all memos resolved',
    }
    const memos: MemoV2[] = [
      {
        id: 'm1',
        type: 'fix',
        status: 'answered',
        owner: 'human',
        source: 'cursor',
        color: 'red',
        text: 'Fix this',
        anchorText: 'Some text',
        anchor: 'L1:L1|abc123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'm2',
        type: 'question',
        status: 'open',
        owner: 'human',
        source: 'cursor',
        color: 'blue',
        text: 'Question',
        anchorText: 'Some text',
        anchor: 'L2:L2|def456',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ]

    const status = evaluateGate(gate, memos)
    expect(status).toBe('proceed')
  })

  it('evaluateAllGates updates status for all gates', () => {
    const gates: Gate[] = [
      {
        id: 'gate-1',
        type: 'merge',
        status: 'blocked',
        blockedBy: ['m1'],
        canProceedIf: 'all fixes addressed',
        doneDefinition: 'all memos resolved',
      },
      {
        id: 'gate-2',
        type: 'release',
        status: 'proceed',
        blockedBy: [],
        canProceedIf: 'no open issues',
        doneDefinition: 'ready for release',
      },
    ]
    const memos: MemoV2[] = [
      {
        id: 'm1',
        type: 'fix',
        status: 'open',
        owner: 'human',
        source: 'cursor',
        color: 'red',
        text: 'Fix this',
        anchorText: 'Some text',
        anchor: 'L1:L1|abc123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ]

    const updatedGates = evaluateAllGates(gates, memos)

    expect(updatedGates[0].status).toBe('blocked')
    expect(updatedGates[1].status).toBe('proceed')
  })

  it('returns blocked when gate has blocking memo in needs_review', () => {
    const gate: Gate = {
      id: 'gate-1',
      type: 'merge',
      status: 'proceed',
      blockedBy: ['m1'],
      canProceedIf: 'all fixes addressed',
      doneDefinition: 'all memos resolved',
    }
    const memos: MemoV2[] = [
      {
        id: 'm1',
        type: 'fix',
        status: 'needs_review',
        owner: 'agent',
        source: 'mcp',
        color: 'red',
        text: 'Fix this',
        anchorText: 'Some text',
        anchor: 'L1:L1|abc123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ]

    const status = evaluateGate(gate, memos)
    expect(status).toBe('blocked')
  })

  it('returns proceed when blocking memo is done but another memo is needs_review', () => {
    const gate: Gate = {
      id: 'gate-1',
      type: 'merge',
      status: 'blocked',
      blockedBy: ['m1'],
      canProceedIf: 'all fixes addressed',
      doneDefinition: 'all memos resolved',
    }
    const memos: MemoV2[] = [
      {
        id: 'm1',
        type: 'fix',
        status: 'done',
        owner: 'human',
        source: 'cursor',
        color: 'red',
        text: 'Fix this',
        anchorText: 'Some text',
        anchor: 'L1:L1|abc123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'm2',
        type: 'question',
        status: 'needs_review',
        owner: 'agent',
        source: 'mcp',
        color: 'blue',
        text: 'Question',
        anchorText: 'Some text',
        anchor: 'L2:L2|def456',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ]

    const status = evaluateGate(gate, memos)
    expect(status).toBe('proceed')
  })

  it('returns done only when all memos are in terminal status (done/wontfix)', () => {
    const gate: Gate = {
      id: 'gate-1',
      type: 'merge',
      status: 'blocked',
      blockedBy: [],
      canProceedIf: 'all fixes addressed',
      doneDefinition: 'all memos resolved',
    }
    const memos: MemoV2[] = [
      {
        id: 'm1',
        type: 'fix',
        status: 'done',
        owner: 'human',
        source: 'cursor',
        color: 'red',
        text: 'Fix this',
        anchorText: 'Some text',
        anchor: 'L1:L1|abc123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'm2',
        type: 'question',
        status: 'wontfix',
        owner: 'human',
        source: 'cursor',
        color: 'blue',
        text: 'Question',
        anchorText: 'Some text',
        anchor: 'L2:L2|def456',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ]

    const status = evaluateGate(gate, memos)
    expect(status).toBe('done')
  })

  it('does not return done when any memo is needs_review', () => {
    const gate: Gate = {
      id: 'gate-1',
      type: 'merge',
      status: 'blocked',
      blockedBy: [],
      canProceedIf: 'all fixes addressed',
      doneDefinition: 'all memos resolved',
    }
    const memos: MemoV2[] = [
      {
        id: 'm1',
        type: 'fix',
        status: 'done',
        owner: 'human',
        source: 'cursor',
        color: 'red',
        text: 'Fix this',
        anchorText: 'Some text',
        anchor: 'L1:L1|abc123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'm2',
        type: 'question',
        status: 'needs_review',
        owner: 'agent',
        source: 'mcp',
        color: 'blue',
        text: 'Question',
        anchorText: 'Some text',
        anchor: 'L2:L2|def456',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ]

    const status = evaluateGate(gate, memos)
    expect(status).not.toBe('done')
  })
})
