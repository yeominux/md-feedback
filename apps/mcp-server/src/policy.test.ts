import { describe, expect, it } from 'vitest'
import { OperationValidationError } from './errors'
import { assertMemoActionAllowed, getPolicySnapshot, resolvePolicyProfile } from './policy'

describe('policy', () => {
  it('defaults to default profile when env var is missing', () => {
    expect(resolvePolicyProfile({})).toBe('default')
  })

  it('resolves strict profile when env var is set', () => {
    expect(resolvePolicyProfile({ MD_FEEDBACK_POLICY_PROFILE: 'strict' })).toBe('strict')
  })

  it('returns memo action route snapshot', () => {
    expect(getPolicySnapshot('default')).toEqual({
      profile: 'default',
      memoActions: {
        respond_to_memo: { allowedMemoTypes: ['question'] },
        apply_memo: { allowedMemoTypes: ['fix'] },
        batch_apply: { allowedMemoTypes: ['fix'] },
      },
    })
  })

  it('allows valid action/type combinations', () => {
    expect(() => assertMemoActionAllowed('respond_to_memo', 'm1', 'question')).not.toThrow()
    expect(() => assertMemoActionAllowed('apply_memo', 'm2', 'fix')).not.toThrow()
    expect(() => assertMemoActionAllowed('batch_apply', 'm3', 'fix')).not.toThrow()
  })

  it('rejects invalid action/type combinations with policy details', () => {
    let thrown: unknown
    try {
      assertMemoActionAllowed('apply_memo', 'm4', 'question')
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(OperationValidationError)
    const error = thrown as OperationValidationError
    expect(error.details).toMatchObject({
      memoId: 'm4',
      memoType: 'question',
      action: 'apply_memo',
      policyProfile: 'default',
      allowedMemoTypes: ['fix'],
    })
  })
})
