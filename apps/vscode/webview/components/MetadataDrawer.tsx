import type { Gate, PlanCursor, Checkpoint } from '@md-feedback/shared'
import { useState } from 'react'
import { X } from 'lucide-react'
import { vscode } from '../lib/vscode-api'
import type { StatusSummary } from '../types'

interface MetadataDrawerProps {
  open: boolean
  onClose: () => void
  gates: Gate[]
  cursor: PlanCursor | null
  checkpoints?: Checkpoint[]
  statusSummary?: StatusSummary | null
  workflowPhase?: StatusSummary['workflowPhase']
  unresolvedBlockingCount?: number
  approvalRequired?: boolean
}

const OVERRIDE_OPTIONS = [
  { value: '', label: 'Auto' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'proceed', label: 'Proceed' },
  { value: 'done', label: 'Done' },
] as const

function GateCard({ gate }: { gate: Gate }) {
  const [override, setOverride] = useState(gate.override || '')

  const handleOverrideChange = (value: string) => {
    setOverride(value)
    vscode.postMessage({
      type: 'gate.override',
      gateId: gate.id,
      override: value || null,
    })
  }

  const statusDotColor = gate.status === 'blocked' ? '#dc2626' : gate.status === 'done' ? '#059669' : '#d97706'

  return (
    <div className="p-2 bg-mf-bg rounded border border-mf-border text-xs">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-mf-faint">{gate.type} Gate</span>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-mf-muted">
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: statusDotColor }} />
          {gate.status}
        </span>
      </div>
      {gate.doneDefinition && (
        <div className="text-mf-muted mb-1">{gate.doneDefinition}</div>
      )}
      {gate.blockedBy.length > 0 && (
        <div className="text-mf-faint mb-1">
          Blocked by: {gate.blockedBy.length} memos
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className="text-mf-faint">Override:</span>
        <select
          value={override}
          onChange={(e) => handleOverrideChange(e.target.value)}
          className="text-[10px] bg-mf-surface border border-mf-border rounded px-1 py-0.5 text-mf-text"
        >
          {OVERRIDE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

export function MetadataDrawer({ open, onClose, gates, cursor, checkpoints = [], statusSummary, workflowPhase, unresolvedBlockingCount = 0, approvalRequired = false }: MetadataDrawerProps) {
  if (!open) return null

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-panel" role="dialog" aria-label="Document details">
        <div className="drawer-header">
          <h2 className="text-sm font-bold text-mf-text">Details</h2>
          <button onClick={onClose} className="text-mf-faint hover:text-mf-text" aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {/* ── Status Overview ── */}
        {statusSummary && statusSummary.totalMemos > 0 && (
          <div className="drawer-section">
            <h3 className="drawer-section-title">Status Overview</h3>
            <div className="p-3 bg-mf-bg rounded border border-mf-border space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-mf-faint">Resolved</span>
                <span className="font-medium text-mf-text">{statusSummary.resolvedMemos}/{statusSummary.totalMemos}</span>
              </div>
              {statusSummary.inProgressMemos > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-mf-faint">In Progress</span>
                  <span className="font-medium text-mf-status-in-progress">{statusSummary.inProgressMemos}</span>
                </div>
              )}
              {unresolvedBlockingCount > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-mf-faint">Blocking</span>
                  <span className="font-medium text-mf-accent-fix">{unresolvedBlockingCount}</span>
                </div>
              )}
              {workflowPhase && (
                <div className="flex justify-between text-xs">
                  <span className="text-mf-faint">Phase</span>
                  <span className="font-medium text-mf-text capitalize">{workflowPhase.replace('_', ' ')}</span>
                </div>
              )}
              {approvalRequired && (
                <div className="flex justify-between text-xs">
                  <span className="text-mf-faint">Approval</span>
                  <span className="font-medium text-mf-accent-fix">Required</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Plan Cursor ── */}
        <div className="drawer-section">
          <h3 className="drawer-section-title">Plan Cursor</h3>

          {cursor ? (
            <div className="p-3 bg-mf-bg rounded border border-mf-border">
              <div className="flex justify-between mb-1">
                <span className="text-xs font-medium text-mf-text">Task {cursor.taskId}</span>
                <span className="text-xs text-mf-faint">{cursor.step}</span>
              </div>
              <div className="text-xs text-mf-muted">{cursor.nextAction}</div>
            </div>
          ) : (
            <div className="text-xs text-mf-faint">No cursor set</div>
          )}
        </div>

        {/* ── Gates ── */}
        <div className="drawer-section">
          <h3 className="drawer-section-title">Gates</h3>

          {gates.length > 0 ? (
            <div className="space-y-2">
              {gates.map(gate => (
                <GateCard key={gate.id} gate={gate} />
              ))}
            </div>
          ) : (
            <div className="text-xs text-mf-faint">No gates</div>
          )}
        </div>

        {/* ── Checkpoints ── */}
        {checkpoints.length > 0 && (
          <div className="drawer-section">
            <h3 className="drawer-section-title">Checkpoints ({checkpoints.length})</h3>
            <div className="space-y-2">
              {checkpoints.map(cp => (
                <div key={cp.id} className="p-2 bg-mf-bg rounded border border-mf-border text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-mf-text">{cp.note || cp.id}</span>
                    <span className="text-[10px] text-mf-faint">
                      {new Date(cp.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-mf-muted">
                    {cp.fixes} fix · {cp.questions} Q · {cp.highlights} HL
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
