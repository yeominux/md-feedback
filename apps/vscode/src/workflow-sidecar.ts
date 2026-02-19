import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'

export type WorkflowPhase = 'scope' | 'root_cause' | 'implementation' | 'verification'

interface WorkflowTransition {
  from: WorkflowPhase
  to: WorkflowPhase
  tool: string
  note?: string
  timestamp: string
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

const WORKFLOW_PHASE_ORDER: WorkflowPhase[] = ['scope', 'root_cause', 'implementation', 'verification']

function getWorkflowPath(file: string): string {
  const sidecar = join(dirname(file), '.md-feedback')
  if (!existsSync(sidecar)) {
    mkdirSync(sidecar, { recursive: true })
  }
  return join(sidecar, 'workflow.json')
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

function writeWorkflowState(file: string, state: WorkflowState): void {
  const workflowPath = getWorkflowPath(file)
  const tmp = `${workflowPath}.tmp-${randomBytes(4).toString('hex')}`
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8')
  renameSync(tmp, workflowPath)
}

export function getWorkflowState(file: string): WorkflowState {
  const path = getWorkflowPath(file)
  if (!existsSync(path)) {
    return buildDefaultWorkflowState()
  }
  try {
    const raw = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as Partial<WorkflowState>
    const phase = parsed.phase
    if (!phase || !WORKFLOW_PHASE_ORDER.includes(phase)) {
      return buildDefaultWorkflowState()
    }
    return {
      version: '1.0',
      phase,
      status: 'active',
      transitions: Array.isArray(parsed.transitions) ? parsed.transitions : [],
      pendingCheckpoint: parsed.pendingCheckpoint && typeof parsed.pendingCheckpoint === 'object'
        ? parsed.pendingCheckpoint as ApprovalCheckpoint
        : null,
      approvals: Array.isArray(parsed.approvals) ? parsed.approvals : [],
      approvalGrant: parsed.approvalGrant && typeof parsed.approvalGrant === 'object'
        ? parsed.approvalGrant as ApprovalGrant
        : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    }
  } catch {
    return buildDefaultWorkflowState()
  }
}

export function advanceWorkflowPhase(file: string, toPhase: WorkflowPhase, tool: string, note?: string): WorkflowState {
  const current = getWorkflowState(file)
  if (toPhase === current.phase) return current

  const currentIdx = WORKFLOW_PHASE_ORDER.indexOf(current.phase)
  const nextIdx = WORKFLOW_PHASE_ORDER.indexOf(toPhase)
  if (nextIdx !== currentIdx + 1) {
    throw new Error(`Invalid workflow transition: ${current.phase} -> ${toPhase}`)
  }

  const updated: WorkflowState = {
    ...current,
    phase: toPhase,
    transitions: [
      ...current.transitions,
      {
        from: current.phase,
        to: toPhase,
        tool,
        note,
        timestamp: new Date().toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  }
  writeWorkflowState(file, updated)
  return updated
}

export function approveCheckpoint(file: string, tool: string, approvedBy: string, reason: string): WorkflowState {
  const current = getWorkflowState(file)
  const pending = current.pendingCheckpoint
  if (!pending || pending.tool !== tool) {
    throw new Error(`No pending checkpoint for tool "${tool}".`)
  }

  const approval: ApprovalRecord = {
    checkpointId: pending.id,
    tool,
    approvedBy,
    reason,
    approvedAt: new Date().toISOString(),
  }

  const updated: WorkflowState = {
    ...current,
    pendingCheckpoint: null,
    approvals: [...current.approvals, approval],
    approvalGrant: {
      checkpointId: pending.id,
      tool,
      approvedBy,
      approvedAt: approval.approvedAt,
      consumed: false,
    },
    updatedAt: new Date().toISOString(),
  }
  writeWorkflowState(file, updated)
  return updated
}
