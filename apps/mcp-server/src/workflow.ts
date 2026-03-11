import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { ensureSidecar, readMarkdownFile } from './file-ops.js'
import { OperationValidationError } from './errors.js'
import { isResolved, splitDocument, parseJsonWithBom, type MemoType } from '@md-feedback/shared'

export type WorkflowPhase = 'scope' | 'root_cause' | 'implementation' | 'verification'
export type MemoSeverity = 'blocking' | 'non_blocking'

interface WorkflowTransition {
  from: WorkflowPhase
  to: WorkflowPhase
  tool: string
  note?: string
  timestamp: string
}

export interface WorkflowState {
  version: '1.0'
  phase: WorkflowPhase
  status: 'active'
  transitions: WorkflowTransition[]
  pendingCheckpoint: ApprovalCheckpoint | null
  approvals: ApprovalRecord[]
  approvalGrant: ApprovalGrant | null
  updatedAt: string
}

interface ApprovalCheckpoint {
  id: string
  tool: string
  reason: string
  requestedAt: string
}

interface ApprovalRecord {
  checkpointId: string
  tool: string
  approvedBy: string
  reason: string
  approvedAt: string
}

interface ApprovalGrant {
  checkpointId: string
  tool: string
  approvedBy: string
  approvedAt: string
  consumed: boolean
}

export type WorkflowEnforcementMode = 'off' | 'strict'

const WORKFLOW_PHASE_ORDER: WorkflowPhase[] = ['scope', 'root_cause', 'implementation', 'verification']

const TOOL_ALLOWED_PHASES: Record<string, WorkflowPhase[]> = {
  create_annotation: ['scope', 'root_cause'],
  respond_to_memo: ['root_cause', 'implementation'],
  apply_memo: ['implementation'],
  batch_apply: ['implementation'],
  rollback_memo: ['implementation'],
  update_memo_status: ['implementation', 'verification'],
  update_memo_progress: ['implementation', 'verification'],
  link_artifacts: ['implementation', 'verification'],
  update_cursor: ['implementation', 'verification'],
  create_checkpoint: ['verification'],
  set_memo_severity: ['scope', 'root_cause', 'implementation', 'verification'],
  request_approval_checkpoint: ['scope', 'root_cause', 'implementation', 'verification'],
  approve_checkpoint: ['scope', 'root_cause', 'implementation', 'verification'],
}

const HIGH_RISK_TOOLS = new Set(['batch_apply', 'rollback_memo'])

function getWorkflowPath(file: string): string {
  return join(ensureSidecar(file), 'workflow.json')
}

function getSeverityPath(file: string): string {
  return join(ensureSidecar(file), 'severity.json')
}

export function resolveWorkflowEnforcementMode(env: NodeJS.ProcessEnv = process.env): WorkflowEnforcementMode {
  return env.MD_FEEDBACK_WORKFLOW_ENFORCEMENT?.trim().toLowerCase() === 'strict' ? 'strict' : 'off'
}

interface MemoSeverityOverrides {
  version: '1.0'
  overrides: Record<string, MemoSeverity>
  updatedAt: string
}

function readMemoSeverityOverrides(file: string): MemoSeverityOverrides {
  const severityPath = getSeverityPath(file)
  if (!existsSync(severityPath)) {
    return { version: '1.0', overrides: {}, updatedAt: new Date().toISOString() }
  }
  try {
    const parsed = parseJsonWithBom<Partial<MemoSeverityOverrides>>(readFileSync(severityPath, 'utf-8'))
    return {
      version: '1.0',
      overrides: (parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {}) as Record<string, MemoSeverity>,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    }
  } catch {
    return { version: '1.0', overrides: {}, updatedAt: new Date().toISOString() }
  }
}

function writeMemoSeverityOverrides(file: string, payload: MemoSeverityOverrides): void {
  const severityPath = getSeverityPath(file)
  const tempPath = `${severityPath}.tmp-${randomBytes(6).toString('hex')}`
  writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf-8')
  renameSync(tempPath, severityPath)
}

function defaultSeverityForMemoType(type: MemoType): MemoSeverity {
  return type === 'fix' ? 'blocking' : 'non_blocking'
}

export function resolveMemoSeverity(file: string, memoId: string, memoType: MemoType): MemoSeverity {
  const overrides = readMemoSeverityOverrides(file)
  return overrides.overrides[memoId] ?? defaultSeverityForMemoType(memoType)
}

export function setMemoSeverityOverride(file: string, memoId: string, severity: MemoSeverity): MemoSeverityOverrides {
  const current = readMemoSeverityOverrides(file)
  const updated: MemoSeverityOverrides = {
    version: '1.0',
    overrides: { ...current.overrides, [memoId]: severity },
    updatedAt: new Date().toISOString(),
  }
  writeMemoSeverityOverrides(file, updated)
  return updated
}

export function getMemoSeverityStatus(file: string): {
  overrides: Record<string, MemoSeverity>
  unresolvedBlockingMemos: string[]
} {
  const markdown = readMarkdownFile(file)
  const parts = splitDocument(markdown)
  const overrides = readMemoSeverityOverrides(file).overrides
  const unresolvedBlockingMemos = parts.memos
    .filter(m => !isResolved(m.status))
    .filter(m => (overrides[m.id] ?? defaultSeverityForMemoType(m.type)) === 'blocking')
    .map(m => m.id)

  return { overrides, unresolvedBlockingMemos }
}

function writeWorkflowState(file: string, state: WorkflowState): void {
  const workflowPath = getWorkflowPath(file)
  const tempPath = `${workflowPath}.tmp-${randomBytes(6).toString('hex')}`
  writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8')
  renameSync(tempPath, workflowPath)
}

function buildDefaultWorkflowState(): WorkflowState {
  return {
    version: '1.0',
    phase: 'scope',
    status: 'active',
    transitions: [],
    pendingCheckpoint: null,
    approvals: [],
    approvalGrant: null,
    updatedAt: new Date().toISOString(),
  }
}

export function readWorkflowState(file: string): WorkflowState {
  const workflowPath = getWorkflowPath(file)
  if (!existsSync(workflowPath)) {
    return buildDefaultWorkflowState()
  }

  try {
    const parsed = parseJsonWithBom<Partial<WorkflowState>>(readFileSync(workflowPath, 'utf-8'))
    const phase = parsed.phase
    const transitions = Array.isArray(parsed.transitions) ? parsed.transitions : []
    if (!phase || !WORKFLOW_PHASE_ORDER.includes(phase)) {
      return buildDefaultWorkflowState()
    }
    return {
      version: '1.0',
      phase,
      status: 'active',
      transitions: transitions as WorkflowTransition[],
      pendingCheckpoint: parsed.pendingCheckpoint && typeof parsed.pendingCheckpoint === 'object'
        ? parsed.pendingCheckpoint as ApprovalCheckpoint
        : null,
      approvals: Array.isArray(parsed.approvals) ? parsed.approvals as ApprovalRecord[] : [],
      approvalGrant: parsed.approvalGrant && typeof parsed.approvalGrant === 'object'
        ? parsed.approvalGrant as ApprovalGrant
        : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    }
  } catch {
    return buildDefaultWorkflowState()
  }
}

export function getWorkflowState(file: string): WorkflowState {
  const state = readWorkflowState(file)
  // Persist defaults lazily so users can inspect workflow.json immediately.
  if (state.transitions.length === 0 && state.phase === 'scope') {
    writeWorkflowState(file, state)
  }
  return state
}

export function assertWorkflowToolAllowed(file: string, toolName: string): WorkflowState {
  const state = getWorkflowState(file)
  if (resolveWorkflowEnforcementMode() !== 'strict') {
    return state
  }
  const allowedPhases = TOOL_ALLOWED_PHASES[toolName]
  if (!allowedPhases) {
    return state
  }
  if (allowedPhases.includes(state.phase)) {
    return state
  }

  throw new OperationValidationError(
    `Tool "${toolName}" is not allowed in phase "${state.phase}".`,
    {
      tool: toolName,
      currentPhase: state.phase,
      allowedPhases,
    },
  )
}

function writeWorkflowWithUpdate(file: string, updater: (state: WorkflowState) => WorkflowState): WorkflowState {
  const current = getWorkflowState(file)
  const updated = updater(current)
  writeWorkflowState(file, updated)
  return updated
}

export function requestApprovalCheckpoint(file: string, tool: string, reason: string): WorkflowState {
  return writeWorkflowWithUpdate(file, (state) => {
    if (state.pendingCheckpoint && state.pendingCheckpoint.tool === tool) {
      return state
    }
    return {
      ...state,
      pendingCheckpoint: {
        id: `chk_${randomBytes(4).toString('hex')}`,
        tool,
        reason,
        requestedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    }
  })
}

export function approveCheckpoint(file: string, tool: string, approvedBy: string, reason: string): WorkflowState {
  return writeWorkflowWithUpdate(file, (state) => {
    const pending = state.pendingCheckpoint
    if (!pending || pending.tool !== tool) {
      throw new OperationValidationError(
        `No pending checkpoint for tool "${tool}".`,
        {
          tool,
          pendingCheckpoint: pending,
        },
      )
    }
    const approval: ApprovalRecord = {
      checkpointId: pending.id,
      tool,
      approvedBy,
      reason,
      approvedAt: new Date().toISOString(),
    }
    return {
      ...state,
      pendingCheckpoint: null,
      approvals: [...state.approvals, approval],
      approvalGrant: {
        checkpointId: pending.id,
        tool,
        approvedBy,
        approvedAt: approval.approvedAt,
        consumed: false,
      },
      updatedAt: new Date().toISOString(),
    }
  })
}

export function consumeHighRiskApproval(file: string, tool: string, reason: string): WorkflowState {
  if (resolveWorkflowEnforcementMode() !== 'strict') {
    return getWorkflowState(file)
  }
  if (!HIGH_RISK_TOOLS.has(tool)) {
    return getWorkflowState(file)
  }

  const current = getWorkflowState(file)
  if (current.approvalGrant && !current.approvalGrant.consumed && current.approvalGrant.tool === tool) {
    const updated: WorkflowState = {
      ...current,
      approvalGrant: { ...current.approvalGrant, consumed: true },
      updatedAt: new Date().toISOString(),
    }
    writeWorkflowState(file, updated)
    return updated
  }

  const withPending = requestApprovalCheckpoint(file, tool, reason)
  throw new OperationValidationError(
    `Approval required before high-risk tool "${tool}".`,
    {
      tool,
      reason,
      pendingCheckpoint: withPending.pendingCheckpoint,
    },
  )
}

export function advanceWorkflowPhase(file: string, toPhase: WorkflowPhase, tool: string, note?: string): WorkflowState {
  const state = getWorkflowState(file)
  if (toPhase === state.phase) {
    return state
  }

  const currentIdx = WORKFLOW_PHASE_ORDER.indexOf(state.phase)
  const nextIdx = WORKFLOW_PHASE_ORDER.indexOf(toPhase)
  if (nextIdx !== currentIdx + 1) {
    throw new OperationValidationError(
      `Invalid workflow transition: ${state.phase} -> ${toPhase}. Expected next phase: ${WORKFLOW_PHASE_ORDER[currentIdx + 1] ?? 'none'}.`,
      {
        currentPhase: state.phase,
        requestedPhase: toPhase,
        expectedNextPhase: WORKFLOW_PHASE_ORDER[currentIdx + 1] ?? null,
      },
    )
  }

  if (toPhase === 'verification') {
    const severity = getMemoSeverityStatus(file)
    if (severity.unresolvedBlockingMemos.length > 0) {
      throw new OperationValidationError(
        'Cannot advance to verification with unresolved blocking memos.',
        {
          currentPhase: state.phase,
          requestedPhase: toPhase,
          unresolvedBlockingMemos: severity.unresolvedBlockingMemos,
        },
      )
    }
  }

  const updated: WorkflowState = {
    ...state,
    phase: toPhase,
    updatedAt: new Date().toISOString(),
    transitions: [
      ...state.transitions,
      {
        from: state.phase,
        to: toPhase,
        tool,
        note,
        timestamp: new Date().toISOString(),
      },
    ],
  }
  writeWorkflowState(file, updated)
  return updated
}
