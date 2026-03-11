export interface StatusSummary {
  openFixes: number
  openQuestions: number
  openHighlights: number
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

export interface MemoMapEntry { text: string; color: string; type: string; status: string }
export type MemoMap = Record<string, MemoMapEntry>
