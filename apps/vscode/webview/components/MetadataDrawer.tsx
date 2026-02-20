import type { Gate, PlanCursor, Checkpoint } from '@md-feedback/shared'
import { useState } from 'react'
import { X } from 'lucide-react'
import { vscode } from '../lib/vscode-api'
import type { StatusSummary, MemoMap } from '../types'

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
  memoMap?: MemoMap
  onNavigateToMemo?: (memoId: string) => void
}

const OVERRIDE_OPTIONS = [
  { value: '', label: 'Auto' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'proceed', label: 'Proceed' },
  { value: 'done', label: 'Done' },
] as const

// ── Helpers ──

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s
}

function humanizeMemoRef(text: string, memoMap?: MemoMap): string {
  if (!memoMap) return text
  return text.replace(/\bmemo_[a-zA-Z0-9_]+/g, (match) => {
    const entry = memoMap[match]
    return entry ? `"${truncate(entry.text, 40)}"` : match
  })
}

function formatCheckpointStats(cp: Checkpoint): string {
  const parts: string[] = []
  if (cp.fixes > 0) parts.push(`${cp.fixes} fix`)
  if (cp.questions > 0) parts.push(`${cp.questions} Q`)
  if (cp.highlights > 0) parts.push(`${cp.highlights} HL`)
  return parts.length > 0 ? parts.join(' \u00b7 ') : 'no annotations'
}

// ── GateCard ──

function GateCard({ gate }: { gate: Gate }) {
  const [override, setOverride] = useState(gate.override || '')
  const [showMore, setShowMore] = useState(false)

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
      {showMore ? (
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
      ) : (
        <button
          onClick={() => setShowMore(true)}
          className="text-[10px] text-mf-faint hover:text-mf-muted mt-1"
          aria-label="Show gate override options"
        >
          More...
        </button>
      )}
    </div>
  )
}

// ── MetadataDrawer ──

export function MetadataDrawer({ open, onClose, gates, cursor, checkpoints = [], statusSummary, workflowPhase, unresolvedBlockingCount = 0, approvalRequired = false, memoMap, onNavigateToMemo }: MetadataDrawerProps) {
  const [showAutoCheckpoints, setShowAutoCheckpoints] = useState(false)

  if (!open) return null

  // Checkpoints: sort newest-first, split named vs auto
  const sortedCheckpoints = [...checkpoints].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  const latestCheckpoint = sortedCheckpoints[0] ?? null
  const rest = sortedCheckpoints.slice(1)
  const namedCheckpoints = rest.filter(cp => cp.note && cp.note !== 'auto')
  const autoCheckpoints = rest.filter(cp => !cp.note || cp.note === 'auto')

  // Cursor: resolve task text from memoMap
  const cursorTaskText = cursor && memoMap?.[cursor.taskId]
    ? truncate(memoMap[cursor.taskId].text, 60)
    : null

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
            <div className="p-3 bg-mf-bg rounded border-l-2 border-mf-border" style={{ borderLeftColor: 'var(--mf-accent-highlight, #d97706)' }}>
              <div className="flex justify-between text-xs">
                <span className="text-mf-faint">Resolved</span>
                <span className="font-medium text-mf-text">{statusSummary.resolvedMemos}/{statusSummary.totalMemos}</span>
              </div>
              {/* Progress bar */}
              <div className="mt-1.5 rounded-full overflow-hidden" style={{ height: 6, background: 'var(--mf-border, #e5e7eb)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round((statusSummary.resolvedMemos / statusSummary.totalMemos) * 100)}%`,
                    background: 'var(--mf-status-done, #059669)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              {statusSummary.inProgressMemos > 0 && (
                <div className="flex justify-between text-xs mt-2">
                  <span className="text-mf-faint">In Progress</span>
                  <span className="font-medium text-mf-status-in-progress">{statusSummary.inProgressMemos}</span>
                </div>
              )}
              {unresolvedBlockingCount > 0 && (
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-mf-faint">Blocking</span>
                  <span className="font-medium text-mf-accent-fix">{unresolvedBlockingCount}</span>
                </div>
              )}
              {workflowPhase && (
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-mf-faint">Phase</span>
                  <span className="font-medium text-mf-text capitalize">{workflowPhase.replace(/_/g, ' ')}</span>
                </div>
              )}
              {approvalRequired && (
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-mf-faint">Approval</span>
                  <span className="font-medium text-mf-accent-fix">Required</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Current Task (was Plan Cursor) ── */}
        <div className="drawer-section">
          <h3 className="drawer-section-title">Current Task</h3>

          {cursor ? (
            <div className="p-3 bg-mf-bg rounded border border-mf-border">
              {cursorTaskText ? (
                <button
                  className="text-xs font-medium text-mf-text text-left hover:underline cursor-pointer mb-1 block"
                  onClick={() => onNavigateToMemo?.(cursor.taskId)}
                  title="Click to scroll to memo"
                >
                  &ldquo;{cursorTaskText}&rdquo;
                </button>
              ) : (
                <div className="text-xs font-medium text-mf-text mb-1">Task {cursor.taskId}</div>
              )}
              <div className="text-xs text-mf-muted">{humanizeMemoRef(cursor.nextAction, memoMap)}</div>
            </div>
          ) : (
            <div className="text-xs text-mf-faint">No current task</div>
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
              {/* Latest checkpoint — prominent */}
              {latestCheckpoint && (
                <div className="p-2 bg-mf-bg rounded border-l-2 border-mf-border text-xs" style={{ borderLeftColor: 'var(--mf-accent-highlight, #d97706)' }}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-mf-text">{latestCheckpoint.note && latestCheckpoint.note !== 'auto' ? latestCheckpoint.note : 'Latest'}</span>
                    <span className="text-[10px] text-mf-faint">
                      {new Date(latestCheckpoint.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-mf-muted">{formatCheckpointStats(latestCheckpoint)}</div>
                </div>
              )}

              {/* Named checkpoints */}
              {namedCheckpoints.map(cp => (
                <div key={cp.id} className="p-2 bg-mf-bg rounded border border-mf-border text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-mf-text">{cp.note}</span>
                    <span className="text-[10px] text-mf-faint">
                      {new Date(cp.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-mf-muted">{formatCheckpointStats(cp)}</div>
                </div>
              ))}

              {/* Auto checkpoints — collapsed */}
              {autoCheckpoints.length > 0 && (
                <>
                  <button
                    onClick={() => setShowAutoCheckpoints(!showAutoCheckpoints)}
                    className="text-[10px] text-mf-faint hover:text-mf-muted w-full text-left py-1"
                    aria-expanded={showAutoCheckpoints}
                    aria-label={`${showAutoCheckpoints ? 'Hide' : 'Show'} auto-checkpoints`}
                  >
                    {showAutoCheckpoints ? 'Hide' : 'Show'} {autoCheckpoints.length} auto-checkpoint{autoCheckpoints.length > 1 ? 's' : ''}
                  </button>
                  {showAutoCheckpoints && autoCheckpoints.map(cp => (
                    <div key={cp.id} className="p-2 bg-mf-bg rounded border border-mf-border text-xs" style={{ opacity: 0.6 }}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium text-mf-text">auto</span>
                        <span className="text-[10px] text-mf-faint">
                          {new Date(cp.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-mf-muted">{formatCheckpointStats(cp)}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
