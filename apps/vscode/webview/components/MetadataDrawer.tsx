import type { Gate, PlanCursor, Checkpoint } from '@md-feedback/shared'
import { useState } from 'react'
import { X, ChevronDown, ChevronRight, CheckCircle2, Clock, AlertCircle, CircleDot } from 'lucide-react'
import { vscode } from '../lib/vscode-api'
import type { StatusSummary, MemoMap, MemoMapEntry } from '../types'

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

function relativeTime(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diffMin = Math.round((now - then) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  return `${diffDay}d ago`
}

const TYPE_LABELS: Record<string, string> = {
  fix: 'Fix',
  question: 'Question',
  highlight: 'Highlight',
}

const TYPE_COLORS: Record<string, string> = {
  fix: 'var(--mf-accent-fix)',
  question: 'var(--mf-accent-question)',
  highlight: 'var(--mf-accent-highlight)',
}

const PHASE_LABELS: Record<string, string> = {
  scope: 'Scoping',
  root_cause: 'Analyzing',
  implementation: 'Implementing',
  verification: 'Verifying',
}

function isResolved(status: string): boolean {
  return status === 'done' || status === 'failed' || status === 'wontfix' || status === 'answered'
}

// ── Status icon for memo status ──

function StatusIcon({ status }: { status: string }) {
  if (isResolved(status)) return <CheckCircle2 size={14} style={{ color: 'var(--mf-status-done-text)' }} />
  if (status === 'needs_review') return <AlertCircle size={14} style={{ color: 'var(--mf-status-needs-review-text)' }} />
  if (status === 'in_progress') return <Clock size={14} style={{ color: 'var(--mf-status-in-progress-text)' }} />
  return <CircleDot size={14} style={{ color: 'var(--mf-status-open-text)' }} />
}

// ── MemoItem — clickable memo row ──

function MemoItem({ id, memo, onNavigate }: { id: string; memo: MemoMapEntry; onNavigate?: (id: string) => void }) {
  const typeColor = TYPE_COLORS[memo.type] ?? 'var(--mf-text-faint)'
  const typeLabel = TYPE_LABELS[memo.type] ?? memo.type
  const resolved = isResolved(memo.status)

  return (
    <button
      className={`drawer-memo-item ${resolved ? 'drawer-memo-item--resolved' : ''}`}
      onClick={() => onNavigate?.(id)}
      title="Click to jump to this memo"
    >
      <StatusIcon status={memo.status} />
      <span className="drawer-memo-item__text">{truncate(memo.text || '(empty)', 60)}</span>
      <span className="drawer-memo-item__type" style={{ color: typeColor }}>{typeLabel}</span>
    </button>
  )
}

// ── MetadataDrawer ──

export function MetadataDrawer({ open, onClose, gates, cursor, checkpoints = [], statusSummary, workflowPhase, unresolvedBlockingCount = 0, approvalRequired = false, memoMap, onNavigateToMemo }: MetadataDrawerProps) {
  const [showAllCheckpoints, setShowAllCheckpoints] = useState(false)
  const [expandedGate, setExpandedGate] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  if (!open) return null

  // Checkpoints: sort newest-first
  const sortedCheckpoints = [...checkpoints].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  const latestCheckpoint = sortedCheckpoints[0] ?? null
  // Cap displayed earlier saves to 5
  const displayedOlderCheckpoints = sortedCheckpoints.slice(1, 6)
  const hiddenCount = sortedCheckpoints.length - 1 - displayedOlderCheckpoints.length

  // Cursor: resolve task text from memoMap
  const cursorTaskText = cursor && memoMap?.[cursor.taskId]
    ? truncate(memoMap[cursor.taskId].text, 60)
    : null

  // Group memos by action needed
  const memoEntries = memoMap ? Object.entries(memoMap) : []
  const needsReview = memoEntries.filter(([, m]) => m.status === 'needs_review')
  const openMemos = memoEntries.filter(([, m]) => m.status === 'open')
  const inProgress = memoEntries.filter(([, m]) => m.status === 'in_progress')
  const completed = memoEntries.filter(([, m]) => isResolved(m.status))
  const hasMemos = memoEntries.length > 0

  // Gate summary
  const allGatesDone = gates.length > 0 && gates.every(g => g.status === 'done')
  const blockedGate = gates.find(g => g.status === 'blocked')

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-panel" role="dialog" aria-label="Document details">
        <div className="drawer-header">
          <h2 className="drawer-title">Details</h2>
          <button onClick={onClose} className="drawer-close-btn" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* ── Progress ── */}
        {statusSummary && statusSummary.totalMemos > 0 && (() => {
          const pct = Math.round((statusSummary.resolvedMemos / statusSummary.totalMemos) * 100)
          const allDone = pct === 100
          return (
          <div className="drawer-section">
            <div className="drawer-status-card">
              <div className="drawer-progress-header">
                <span className="drawer-progress-pct" style={{ color: allDone ? 'var(--mf-status-done-text)' : 'var(--mf-text)' }}>{pct}%</span>
                <span className="drawer-progress-label">{statusSummary.resolvedMemos} of {statusSummary.totalMemos} resolved</span>
              </div>
              <div className="drawer-progress-track">
                <div className="drawer-progress-fill" style={{ width: `${pct}%` }} />
              </div>

              {/* Phase + Gate + Approval — compact row */}
              <div className="drawer-meta-row">
                {workflowPhase && (
                  <span className="drawer-phase-pill">
                    {PHASE_LABELS[workflowPhase] ?? workflowPhase.replace(/_/g, ' ')}
                  </span>
                )}
                {gates.length > 0 && (
                  <span
                    className="drawer-gate-pill"
                    style={{
                      color: allGatesDone ? 'var(--mf-status-done-text)' : blockedGate ? 'var(--mf-accent-fix)' : 'var(--mf-status-in-progress-text)',
                      background: allGatesDone ? 'var(--mf-status-done-bg)' : blockedGate ? 'var(--mf-status-failed-bg)' : 'var(--mf-status-in-progress-bg)',
                    }}
                  >
                    {allGatesDone ? 'Checks passed' : blockedGate ? 'Blocked' : 'Checks pending'}
                  </span>
                )}
                {approvalRequired && (
                  <span className="drawer-gate-pill" style={{ color: 'var(--mf-accent-fix)', background: 'var(--mf-status-failed-bg)' }}>
                    Approval needed
                  </span>
                )}
              </div>
            </div>
          </div>
          )
        })()}

        {/* ── Memo list: grouped by action ── */}
        {hasMemos && (
          <div className="drawer-section">
            {/* Needs review — most urgent */}
            {needsReview.length > 0 && (
              <div className="drawer-memo-group">
                <h3 className="drawer-section-title">Needs your review</h3>
                <div className="drawer-memo-list">
                  {needsReview.map(([id, memo]) => (
                    <MemoItem key={id} id={id} memo={memo} onNavigate={onNavigateToMemo} />
                  ))}
                </div>
              </div>
            )}

            {/* To do — open, not yet started */}
            {openMemos.length > 0 && (
              <div className="drawer-memo-group">
                <h3 className="drawer-section-title">To do</h3>
                <div className="drawer-memo-list">
                  {openMemos.map(([id, memo]) => (
                    <MemoItem key={id} id={id} memo={memo} onNavigate={onNavigateToMemo} />
                  ))}
                </div>
              </div>
            )}

            {/* In progress */}
            {inProgress.length > 0 && (
              <div className="drawer-memo-group">
                <h3 className="drawer-section-title">In progress</h3>
                <div className="drawer-memo-list">
                  {inProgress.map(([id, memo]) => (
                    <MemoItem key={id} id={id} memo={memo} onNavigate={onNavigateToMemo} />
                  ))}
                </div>
              </div>
            )}

            {/* Completed — collapsed */}
            {completed.length > 0 && (
              <div className="drawer-memo-group">
                <button
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="drawer-section-title drawer-collapse-btn"
                  aria-expanded={showCompleted}
                >
                  {showCompleted ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  Done ({completed.length})
                </button>
                {showCompleted && (
                  <div className="drawer-memo-list">
                    {completed.map(([id, memo]) => (
                      <MemoItem key={id} id={id} memo={memo} onNavigate={onNavigateToMemo} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── What the AI is working on ── */}
        {cursor && (
          <div className="drawer-section">
            <h3 className="drawer-section-title">AI is working on</h3>
            <div className="drawer-card">
              {cursorTaskText ? (
                <button
                  className="drawer-cursor-task"
                  onClick={() => onNavigateToMemo?.(cursor.taskId)}
                  title="Click to jump to this memo"
                >
                  {cursorTaskText}
                </button>
              ) : (
                <div className="drawer-cursor-fallback">Task {cursor.taskId}</div>
              )}
              {cursor.nextAction && (
                <div className="drawer-cursor-action">{humanizeMemoRef(cursor.nextAction, memoMap)}</div>
              )}
            </div>
          </div>
        )}

        {/* ── Quality gates (expandable, only when not all done) ── */}
        {gates.length > 0 && !allGatesDone && (
          <div className="drawer-section">
            <h3 className="drawer-section-title">Quality checks</h3>
            <div className="drawer-gate-list">
              {gates.map(gate => {
                const dotColor = gate.status === 'blocked' ? 'var(--mf-accent-fix)' : gate.status === 'done' ? 'var(--mf-status-done-text)' : 'var(--mf-status-open-text)'
                const statusText = gate.status === 'done' ? 'Passed' : gate.status === 'blocked' ? 'Blocked' : 'Pending'
                const isExpanded = expandedGate === gate.id
                return (
                  <div key={gate.id} className="drawer-card">
                    <button
                      className="drawer-gate-row"
                      onClick={() => setExpandedGate(isExpanded ? null : gate.id)}
                    >
                      <span className="drawer-stat-dot" style={{ background: dotColor }} />
                      <span className="drawer-gate-label">{gate.doneDefinition || `${gate.type} check`}</span>
                      <span className="drawer-gate-status">{statusText}</span>
                    </button>
                    {isExpanded && (
                      <div className="drawer-gate-detail">
                        {gate.blockedBy.length > 0 && (
                          <div className="drawer-gate-blocked">{gate.blockedBy.length} item{gate.blockedBy.length > 1 ? 's' : ''} need{gate.blockedBy.length > 1 ? '' : 's'} attention</div>
                        )}
                        <div className="drawer-gate-override">
                          <span>Override:</span>
                          <select
                            value={gate.override || ''}
                            onChange={(e) => {
                              vscode.postMessage({ type: 'gate.override', gateId: gate.id, override: e.target.value || null })
                            }}
                            className="drawer-gate-select"
                          >
                            {OVERRIDE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Save history (checkpoints) — minimal ── */}
        {checkpoints.length > 0 && (
          <div className="drawer-section">
            <h3 className="drawer-section-title">Save history</h3>

            {/* Latest */}
            {latestCheckpoint && (
              <div className="drawer-card">
                <div className="drawer-checkpoint-row">
                  <span className="drawer-checkpoint-note">
                    {latestCheckpoint.note && latestCheckpoint.note !== 'auto' ? truncate(latestCheckpoint.note, 50) : 'Last saved'}
                  </span>
                  <span className="drawer-checkpoint-time">{relativeTime(latestCheckpoint.timestamp)}</span>
                </div>
              </div>
            )}

            {/* Rest — collapsed, capped at 5 */}
            {sortedCheckpoints.length > 1 && (
              <>
                <button
                  onClick={() => setShowAllCheckpoints(!showAllCheckpoints)}
                  className="drawer-collapse-link"
                  aria-expanded={showAllCheckpoints}
                >
                  {showAllCheckpoints ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {sortedCheckpoints.length - 1} earlier save{sortedCheckpoints.length > 2 ? 's' : ''}
                </button>
                {showAllCheckpoints && (
                  <>
                    {displayedOlderCheckpoints.map(cp => (
                      <div key={cp.id} className="drawer-card drawer-card--faded">
                        <div className="drawer-checkpoint-row">
                          <span className="drawer-checkpoint-note">
                            {cp.note && cp.note !== 'auto' ? truncate(cp.note, 50) : 'Auto-save'}
                          </span>
                          <span className="drawer-checkpoint-time">{relativeTime(cp.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                    {hiddenCount > 0 && (
                      <div className="drawer-hidden-count">+ {hiddenCount} more</div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
