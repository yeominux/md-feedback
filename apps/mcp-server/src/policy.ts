import type { MemoType } from '@md-feedback/shared'
import { OperationValidationError } from './errors.js'

export type PolicyProfile = 'default' | 'strict'
export type MemoAction = 'respond_to_memo' | 'apply_memo' | 'batch_apply'

interface MemoActionRule {
  allowedMemoTypes: MemoType[]
  guidance: string
}

const DEFAULT_MEMO_ACTION_RULES: Record<MemoAction, MemoActionRule> = {
  respond_to_memo: {
    allowedMemoTypes: ['question'],
    guidance: 'Use apply_memo/update_memo_progress for fix memos.',
  },
  apply_memo: {
    allowedMemoTypes: ['fix'],
    guidance: 'Use respond_to_memo for question memos.',
  },
  batch_apply: {
    allowedMemoTypes: ['fix'],
    guidance: 'Use respond_to_memo for question memos.',
  },
}

const STRICT_MEMO_ACTION_RULES: Record<MemoAction, MemoActionRule> = {
  ...DEFAULT_MEMO_ACTION_RULES,
}

export function resolvePolicyProfile(env: NodeJS.ProcessEnv = process.env): PolicyProfile {
  const raw = env.MD_FEEDBACK_POLICY_PROFILE?.trim().toLowerCase()
  return raw === 'strict' ? 'strict' : 'default'
}

function getMemoActionRules(profile: PolicyProfile): Record<MemoAction, MemoActionRule> {
  return profile === 'strict' ? STRICT_MEMO_ACTION_RULES : DEFAULT_MEMO_ACTION_RULES
}

export function getPolicySnapshot(profile: PolicyProfile = resolvePolicyProfile()): {
  profile: PolicyProfile
  memoActions: Record<MemoAction, { allowedMemoTypes: MemoType[] }>
} {
  const rules = getMemoActionRules(profile)
  return {
    profile,
    memoActions: {
      respond_to_memo: { allowedMemoTypes: [...rules.respond_to_memo.allowedMemoTypes] },
      apply_memo: { allowedMemoTypes: [...rules.apply_memo.allowedMemoTypes] },
      batch_apply: { allowedMemoTypes: [...rules.batch_apply.allowedMemoTypes] },
    },
  }
}

export function assertMemoActionAllowed(
  action: MemoAction,
  memoId: string,
  memoType: MemoType,
  profile: PolicyProfile = resolvePolicyProfile(),
): void {
  const rules = getMemoActionRules(profile)
  const rule = rules[action]
  if (rule.allowedMemoTypes.includes(memoType)) return

  throw new OperationValidationError(
    `${action} supports only ${rule.allowedMemoTypes.join(', ')} memos. ${rule.guidance}`,
    {
      memoId,
      memoType,
      action,
      policyProfile: profile,
      allowedMemoTypes: rule.allowedMemoTypes,
    },
  )
}
