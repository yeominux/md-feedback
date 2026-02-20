import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveWorkflowEnforcementMode, getWorkflowState, readWorkflowState, advanceWorkflowPhase } from './workflow'

describe('workflow', () => {
  it('defaults workflow enforcement to off', () => {
    expect(resolveWorkflowEnforcementMode({})).toBe('off')
  })

  it('resolves strict workflow enforcement from env', () => {
    expect(resolveWorkflowEnforcementMode({ MD_FEEDBACK_WORKFLOW_ENFORCEMENT: 'strict' })).toBe('strict')
  })

  it('reads workflow.json with UTF-8 BOM correctly', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'md-feedback-workflow-bom-'))
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\n', 'utf-8')
    const sidecar = join(workspace, '.md-feedback')
    mkdirSync(sidecar, { recursive: true })
    writeFileSync(
      join(sidecar, 'workflow.json'),
      '\uFEFF' + JSON.stringify({
        version: '1.0',
        phase: 'verification',
        pendingCheckpoint: { id: 'chk_bom', tool: 'batch_apply', reason: 'risk', requestedAt: '2026-02-19T00:00:00.000Z' },
        approvals: [],
        transitions: [],
      }),
      'utf-8',
    )
    try {
      const state = readWorkflowState(file)
      expect(state.phase).toBe('verification')
      expect(state.pendingCheckpoint).not.toBeNull()
      expect(state.pendingCheckpoint!.tool).toBe('batch_apply')
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('creates default scope state and advances sequentially', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'md-feedback-workflow-test-'))
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\n', 'utf-8')
    try {
      const initial = getWorkflowState(file)
      expect(initial.phase).toBe('scope')

      const next = advanceWorkflowPhase(file, 'root_cause', 'test')
      expect(next.phase).toBe('root_cause')
      expect(next.transitions).toHaveLength(1)
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
