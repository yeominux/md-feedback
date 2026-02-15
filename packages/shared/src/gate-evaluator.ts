/**
 * Gate Evaluator — auto-compute gate status based on memo states
 */

import type { Gate, MemoV2 } from './types'

export function evaluateGate(gate: Gate, memos: MemoV2[]): 'blocked' | 'proceed' | 'done' {
  // Check if any blocking memos are still open
  if (gate.blockedBy.length > 0) {
    const blocking = gate.blockedBy
      .map(id => memos.find(m => m.id === id))
      .filter((m): m is MemoV2 => m != null && m.status === 'open')

    if (blocking.length > 0) return 'blocked'
  }

  // Check if all memos are resolved (no open ones)
  const hasOpenMemos = memos.some(m => m.status === 'open')
  if (!hasOpenMemos) return 'done'

  return 'proceed'
}

/** Evaluate all gates and update their status in-place. Returns updated gates. */
export function evaluateAllGates(gates: Gate[], memos: MemoV2[]): Gate[] {
  return gates.map(gate => ({
    ...gate,
    status: evaluateGate(gate, memos),
  }))
}

/** Get a summary of gate statuses */
export function getGateSummary(gates: Gate[]): { blocked: number; proceed: number; done: number } {
  let blocked = 0, proceed = 0, done = 0
  for (const g of gates) {
    if (g.status === 'blocked') blocked++
    else if (g.status === 'proceed') proceed++
    else done++
  }
  return { blocked, proceed, done }
}
