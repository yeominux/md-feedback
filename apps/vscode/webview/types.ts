export interface StatusSummary {
  openFixes: number
  openQuestions: number
  gateStatus: string | null
  totalMemos: number
  resolvedMemos: number
  inProgressMemos: number
  doneMemos: number
  failedMemos: number
  needsReviewMemos?: number
  workflowPhase?: 'scope' | 'root_cause' | 'implementation' | 'verification' | null
  unresolvedBlockingCount?: number
  approvalRequired?: boolean
  pendingApprovalTool?: string | null
}
