/**
 * Gate Evaluator — auto-compute gate status based on memo states.
 *
 * Status logic:
 *   1. If gate.blockedBy contains ANY open memos → "blocked"
 *   2. If ALL memos in document are resolved   → "done"
 *   3. Otherwise                               → "proceed"
 *
 * NOTE: Gate.canProceedIf and Gate.doneDefinition are display-only metadata
 * for human/agent consumption. They do NOT influence these computations.
 */

import type { Gate, MemoV2 } from './types'
import { isResolved } from './types'

export function evaluateGate(gate: Gate, memos: MemoV2[]): 'blocked' | 'proceed' | 'done' {
  // Check if any blocking memos are still unresolved
  if (gate.blockedBy.length > 0) {
    const blocking = gate.blockedBy
      .map(id => memos.find(m => m.id === id))
      .filter((m): m is MemoV2 => m != null && !isResolved(m.status))

    if (blocking.length > 0) return 'blocked'
  }

  // Check if all memos are resolved
  const hasUnresolvedMemos = memos.some(m => !isResolved(m.status))
  if (!hasUnresolvedMemos) return 'done'

  return 'proceed'
}

/** Evaluate all gates and update their status in-place. Returns updated gates.
 *  If a gate has a human override, that takes precedence over auto-evaluation. */
export function evaluateAllGates(gates: Gate[], memos: MemoV2[]): Gate[] {
  return gates.map(gate => ({
    ...gate,
    status: gate.override || evaluateGate(gate, memos),
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
