import { useState } from 'react'
import type { Gate, PlanCursor, ReviewMemo } from '@md-feedback/shared'
import { vscode } from '../lib/vscode-api'
import { MEMO_ACCENT } from '@md-feedback/shared'

interface MetadataDrawerProps {
  open: boolean
  onClose: () => void
  memos: ReviewMemo[]
  gates: Gate[]
  cursor: PlanCursor | null
}

export function MetadataDrawer({ open, onClose, memos, gates, cursor }: MetadataDrawerProps) {
  // Gate creation form state
  const [gateType, setGateType] = useState<Gate['type']>('merge')
  const [blockedBy, setBlockedBy] = useState<string[]>([])
  const [doneDefinition, setDoneDefinition] = useState('')
  
  // Cursor form state
  const [taskId, setTaskId] = useState('')
  const [step, setStep] = useState('')
  const [nextAction, setNextAction] = useState('')
  
  const handleCreateGate = () => {
    const gate: Partial<Gate> = {
      type: gateType,
      blockedBy,
      doneDefinition,
    }
    vscode.postMessage({ type: 'gate.create', gate })
    // Reset form
    setBlockedBy([])
    setDoneDefinition('')
  }
  
  const handleSetCursor = () => {
    vscode.postMessage({ 
      type: 'cursor.set', 
      cursor: { taskId, step, nextAction } 
    })
    // Reset form
    setTaskId('')
    setStep('')
    setNextAction('')
  }

  const toggleBlockedBy = (memoId: string) => {
    setBlockedBy(prev => 
      prev.includes(memoId) 
        ? prev.filter(id => id !== memoId)
        : [...prev, memoId]
    )
  }

  if (!open) return null

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-panel">
        <div className="drawer-header">
          <h2 className="text-sm font-bold text-mf-text">Gates & Cursor</h2>
          <button onClick={onClose} className="text-mf-faint hover:text-mf-text">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>

        {/* ── Plan Cursor ── */}
        <div className="drawer-section">
          <h3 className="drawer-section-title">Plan Cursor</h3>
          
          {cursor && (
            <div className="mb-4 p-3 bg-mf-bg rounded border border-mf-border">
              <div className="flex justify-between mb-1">
                <span className="text-xs font-medium text-mf-text">Task {cursor.taskId}</span>
                <span className="text-xs text-mf-faint">{cursor.step}</span>
              </div>
              <div className="text-xs text-mf-muted">{cursor.nextAction}</div>
            </div>
          )}

          <div className="space-y-2">
            <input
              className="drawer-input"
              placeholder="Task ID (e.g. task-5)"
              value={taskId}
              onChange={e => setTaskId(e.target.value)}
            />
            <input
              className="drawer-input"
              placeholder="Step (e.g. 3/7)"
              value={step}
              onChange={e => setStep(e.target.value)}
            />
            <input
              className="drawer-input"
              placeholder="Next Action"
              value={nextAction}
              onChange={e => setNextAction(e.target.value)}
            />
            <button 
              className="drawer-btn w-full"
              onClick={handleSetCursor}
              disabled={!taskId || !nextAction}
            >
              Set Cursor
            </button>
          </div>
        </div>

        {/* ── Gates ── */}
        <div className="drawer-section">
          <h3 className="drawer-section-title">Gates</h3>

          {/* Existing Gates */}
          {gates.length > 0 && (
            <div className="mb-4 space-y-2">
              {gates.map(gate => (
                <div key={gate.id} className="p-2 bg-mf-bg rounded border border-mf-border text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium capitalize">{gate.type} Gate</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                      gate.status === 'blocked' ? 'status-badge-blocked' :
                      gate.status === 'done' ? 'status-badge-approved' :
                      'status-badge-proceed'
                    }`}>
                      {gate.status.toUpperCase()}
                    </span>
                  </div>
                  {gate.doneDefinition && (
                    <div className="text-mf-muted mb-1">{gate.doneDefinition}</div>
                  )}
                  {gate.blockedBy.length > 0 && (
                    <div className="text-mf-faint">
                      Blocked by: {gate.blockedBy.length} memos
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Create Gate Form */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-mf-muted block mb-1">Type</label>
              <select 
                className="drawer-select"
                value={gateType}
                onChange={e => setGateType(e.target.value as Gate['type'])}
              >
                <option value="merge">Merge</option>
                <option value="release">Release</option>
                <option value="implement">Implement</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-mf-muted block mb-1">Done Definition</label>
              <input
                className="drawer-input"
                placeholder="e.g. All tests pass"
                value={doneDefinition}
                onChange={e => setDoneDefinition(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-mf-muted block mb-1">Blocked By</label>
              <div className="drawer-checkbox-list">
                {memos.length === 0 ? (
                  <div className="text-xs text-mf-faint p-2">No memos available</div>
                ) : (
                  memos.map(memo => (
                    <label key={memo.id} className="flex items-start gap-2 p-1.5 hover:bg-mf-bg-hover cursor-pointer">
                      <input
                        type="checkbox"
                        checked={blockedBy.includes(memo.id)}
                        onChange={() => toggleBlockedBy(memo.id)}
                        className="mt-0.5"
                      />
                      <div className="text-xs overflow-hidden">
                        <span className="mr-1">{MEMO_ACCENT[memo.color as keyof typeof MEMO_ACCENT]?.emoji || '📝'}</span>
                        <span className="text-mf-text truncate">{memo.text}</span>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>

            <button 
              className="drawer-btn w-full"
              onClick={handleCreateGate}
              disabled={!doneDefinition && blockedBy.length === 0}
            >
              Create Gate
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
