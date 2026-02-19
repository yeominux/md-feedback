import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveWorkflowEnforcementMode, getWorkflowState, advanceWorkflowPhase } from './workflow'

describe('workflow', () => {
  it('defaults workflow enforcement to off', () => {
    expect(resolveWorkflowEnforcementMode({})).toBe('off')
  })

  it('resolves strict workflow enforcement from env', () => {
    expect(resolveWorkflowEnforcementMode({ MD_FEEDBACK_WORKFLOW_ENFORCEMENT: 'strict' })).toBe('strict')
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
