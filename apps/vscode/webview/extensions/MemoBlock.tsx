import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { MEMO_ACCENT, HIGHLIGHT_COLORS, type MemoColor, type MemoStatus, type HighlightColor, type MemoImpl } from '@md-feedback/shared'
import { Pencil, X, ChevronDown, Check, Undo2 } from 'lucide-react'

const STATUS_LABELS: Record<MemoStatus, { label: string; color: string; bg: string }> = {
  open:         { label: 'Open',      color: 'text-mf-status-open',           bg: 'bg-mf-status-open' },
  in_progress:  { label: 'Working',   color: 'text-mf-status-in-progress',    bg: 'bg-mf-status-in-progress' },
  needs_review: { label: 'Review',    color: 'text-mf-status-needs-review',   bg: 'bg-mf-status-needs-review' },
  answered:     { label: 'Answered',  color: 'text-mf-status-answered',       bg: 'bg-mf-status-answered' },
  done:         { label: 'Done',      color: 'text-mf-status-done',           bg: 'bg-mf-status-done' },
  failed:       { label: 'Failed',    color: 'text-mf-status-failed',         bg: 'bg-mf-status-failed' },
  wontfix:      { label: "Won't fix", color: 'text-mf-muted',                bg: 'bg-mf-border-subtle' },
}

export function shouldDeleteEmptyMemoOnSave(text: string, source: 'enter' | 'blur'): boolean {
  return !text.trim() && source === 'enter'
}

export const MemoBlock = Node.create({
  name: 'memoBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      memoId:     { default: '' },
      text:       { default: '' },
      color:      { default: 'red' as MemoColor },
      anchorText: { default: '' },
      status:     { default: 'open' as MemoStatus },
      rejectReason: { default: '' },
    }
  },

  parseHTML() {
    return [{
      tag: 'div[data-memo-block]',
      getAttrs: (el) => {
        const element = el as HTMLElement
        return {
          memoId: element.getAttribute('data-memo-id') || '',
          text:   element.getAttribute('data-memo-text') || '',
          color:  element.getAttribute('data-memo-color') || 'red',
          status: element.getAttribute('data-memo-status') || 'open',
          anchorText: element.getAttribute('data-memo-anchor') || '',
        }
      },
    }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-memo-block': '',
      'data-memo-id':    HTMLAttributes.memoId,
      'data-memo-text':  HTMLAttributes.text,
      'data-memo-color': HTMLAttributes.color,
      'data-memo-status': HTMLAttributes.status || 'open',
    }), `memo: ${HTMLAttributes.text || ''}`]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const { memoId, text, color, status } = node.attrs
          const escaped = (text || '').replace(/-->/g, '--\u200B>')
          const statusAttr = status && status !== 'open' ? ` status="${status}"` : ''
          state.write(`<!-- USER_MEMO id="${memoId}" color="${color}"${statusAttr} : ${escaped} -->`)
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(MemoBlockView)
  },
})

function normalizeMemoColor(raw: string): MemoColor {
  if (raw === 'yellow' || raw === 'red' || raw === 'blue') return raw
  if (raw === '#fef08a') return 'yellow'
  if (raw === '#fca5a5') return 'red'
  if (raw === '#93c5fd') return 'blue'
  return 'red'
}

function MemoDiffSection({ memoId }: { memoId: string }) {
  const [expanded, setExpanded] = useState(false)
  const [, setRevision] = useState(0)

  useEffect(() => {
    const handler = () => setRevision(r => r + 1)
    window.addEventListener('mf:impls-updated', handler)
    return () => window.removeEventListener('mf:impls-updated', handler)
  }, [])

  const impls = (window as any).__mfImpls?.filter((i: MemoImpl) => i.memoId === memoId) as MemoImpl[] | undefined

  if (!impls || impls.length === 0) return null

  return (
    <div className="px-3 pb-2.5">
      {impls.map((impl) => {
        const needsCollapse = impl.operations.some(op => {
          if (op.type === 'text_replace') return op.before.split('\n').length > 3 || op.after.split('\n').length > 3
          if (op.type === 'file_create') return (op.content?.split('\n').length ?? 0) > 4
          if (op.type === 'file_patch') return (op.patch?.split('\n').length ?? 0) > 4
          return false
        })
        const isCollapsed = needsCollapse && !expanded

        return (
          <div key={impl.id} className="memo-diff">
            <div className="memo-diff-summary">
              {impl.summary} ({impl.status})
            </div>
            {impl.operations.map((op, idx) => {
              if (op.type === 'text_replace') {
                const lines = [...op.before.split('\n'), ...op.after.split('\n')]
                if (isCollapsed && lines.length > 6) {
                  return (
                    <div key={idx}>
                      <div><span className="memo-diff-before">{op.before.split('\n').slice(0, 2).join('\n')}</span></div>
                      <div><span className="memo-diff-after">{op.after.split('\n').slice(0, 2).join('\n')}</span></div>
                      <button className="memo-diff-toggle" onClick={() => setExpanded(true)}>
                        Show full diff ({lines.length} lines)
                      </button>
                    </div>
                  )
                }
                return (
                  <div key={idx}>
                    <div><span className="memo-diff-before">{op.before}</span></div>
                    <div><span className="memo-diff-after">{op.after}</span></div>
                  </div>
                )
              }
              if (op.type === 'file_create') {
                return (
                  <div key={idx} className="memo-diff">
                    <div className="memo-diff-summary">Create: {op.file}</div>
                    {op.content && (
                      <div><span className="memo-diff-after">{isCollapsed ? op.content.split('\n').slice(0, 4).join('\n') + '\n...' : op.content}</span></div>
                    )}
                  </div>
                )
              }
              if (op.type === 'file_patch') {
                return (
                  <div key={idx} className="memo-diff">
                    <div className="memo-diff-summary">Patch: {op.file}</div>
                    {op.patch && (
                      <div><span className="memo-diff-before">{isCollapsed ? op.patch.split('\n').slice(0, 4).join('\n') + '\n...' : op.patch}</span></div>
                    )}
                  </div>
                )
              }
              return null
            })}
            {expanded && needsCollapse && (
              <button className="memo-diff-toggle" onClick={() => setExpanded(false)}>
                Collapse
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

const STATUS_TRANSITIONS: Record<MemoStatus, MemoStatus[]> = {
  open:         ['open', 'done', 'wontfix'],
  in_progress:  ['in_progress', 'open', 'done', 'failed'],
  needs_review: ['needs_review', 'open', 'done', 'wontfix'],
  answered:     ['answered', 'open', 'done'],
  done:         ['done', 'open'],
  failed:       ['failed', 'open'],
  wontfix:      ['wontfix', 'open'],
}

function MemoBlockView({ node, updateAttributes, deleteNode, selected, editor }: any) {
  const [editing, setEditing] = useState(!node.attrs.text)
  const [text, setText] = useState(node.attrs.text || '')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [focusedStatusIdx, setFocusedStatusIdx] = useState(-1)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const statusMenuRef = useRef<HTMLDivElement>(null)
  const deleteTimerRef = useRef<number>()
  const color = normalizeMemoColor(node.attrs.color || 'red')
  const status = (node.attrs.status || 'open') as MemoStatus
  const accent = MEMO_ACCENT[color]
  const statusInfo = STATUS_LABELS[status]

  // Close status menu on click outside
  useEffect(() => {
    if (!showStatusMenu) return
    const handleClick = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as globalThis.Node)) {
        setShowStatusMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showStatusMenu])

  useEffect(() => {
    if (editing) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [editing])

  // Cleanup delete confirmation timer
  useEffect(() => () => clearTimeout(deleteTimerRef.current), [])

  // Sync text to TipTap node attrs on every change (prevents data loss on scroll/unmount)
  useEffect(() => {
    if (text !== node.attrs.text) {
      updateAttributes({ text })
    }
  }, [text])

  const handleSave = (source: 'enter' | 'blur' = 'enter') => {
    if (shouldDeleteEmptyMemoOnSave(text, source)) {
      // Avoid accidental deletion when focus moves unexpectedly after inserting a new memo.
      // Keep the empty memo card visible unless the user explicitly confirms with Enter.
      handleDelete()
      return
    }
    if (!text.trim()) {
      setEditing(false)
      return
    }
    // text is already synced via useEffect; just exit editing mode
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave('enter')
    }
    if (e.key === 'Escape') {
      if (!node.attrs.text) {
        handleDelete()
        return
      }
      setText(node.attrs.text || '')
      setEditing(false)
    }
  }

  // Cascade delete: remove memo AND its associated highlight mark
  const handleDelete = useCallback(() => {
    if (!editor) { deleteNode(); return }

    const { anchorText, color: memoColor } = node.attrs

    // Find this memo's position in the document
    let memoPos = -1
    editor.state.doc.descendants((n: any, pos: number) => {
      if (memoPos >= 0) return false
      if (n.type.name === 'memoBlock' && n.attrs.memoId === node.attrs.memoId) {
        memoPos = pos
        return false
      }
    })

    if (memoPos < 0) { deleteNode(); return }

    let tr = editor.state.tr

    // Remove associated highlight mark (fix / question only)
    if (memoColor !== 'yellow') {
      const highlightColor = HIGHLIGHT_COLORS[memoColor as HighlightColor]
      if (highlightColor) {
        const markType = editor.schema.marks.highlight

        // Strategy: walk backwards from memo position to find the nearest
        // highlight of matching color in the preceding block
        let bestFrom = -1
        let bestTo = -1

        editor.state.doc.descendants((textNode: any, nodePos: number) => {
          // Only look at nodes before the memo
          if (nodePos >= memoPos) return false
          if (!textNode.isText || !textNode.text) return
          const hasMark = textNode.marks.some((m: any) =>
            m.type === markType && m.attrs.color === highlightColor,
          )
          if (hasMark) {
            // Track the range of consecutive highlighted text
            if (bestTo === nodePos) {
              // Extend existing range
              bestTo = nodePos + textNode.nodeSize
            } else {
              // Start new range (closer to memo = better)
              bestFrom = nodePos
              bestTo = nodePos + textNode.nodeSize
            }
          }
        })

        // Validate match: if anchorText exists, verify overlap
        if (bestFrom >= 0) {
          let shouldRemove = true
          if (anchorText) {
            try {
              const markedText = editor.state.doc.textBetween(bestFrom, bestTo, ' ')
              // Check bidirectional: either contains the other
              const anchor20 = anchorText.slice(0, 20)
              shouldRemove = markedText.includes(anchor20) || anchor20.includes(markedText.slice(0, 20))
            } catch {
              shouldRemove = true // best-effort
            }
          }
          if (shouldRemove) {
            tr = tr.removeMark(bestFrom, bestTo, markType)
          }
        }
      }
    }

    // Delete the memo node (position may have shifted from mark removal — use mapping)
    const mappedPos = tr.mapping.map(memoPos)
    tr = tr.delete(mappedPos, mappedPos + node.nodeSize)
    editor.view.dispatch(tr)
  }, [node.attrs, node.nodeSize, editor, deleteNode])

  // Scroll-to-highlight handler (preserved)
  const handleScrollToHighlight = useCallback(() => {
    if (!editor) return
    const { anchorText, color: memoColor } = node.attrs
    const highlightColor = HIGHLIGHT_COLORS[memoColor as HighlightColor]
    if (!highlightColor) return
    const markType = editor.schema.marks.highlight

    let targetPos = -1
    editor.state.doc.descendants((textNode: any, nodePos: number) => {
      if (targetPos >= 0) return false
      if (!textNode.isText || !textNode.text) return
      const hasMark = textNode.marks.some((m: any) =>
        m.type === markType && m.attrs.color === highlightColor,
      )
      if (hasMark && anchorText) {
        const text20 = anchorText.slice(0, 20)
        if (textNode.text.includes(text20) || text20.includes(textNode.text.slice(0, 20))) {
          targetPos = nodePos
        }
      }
    })

    if (targetPos >= 0) {
      const domAtPos = editor.view.domAtPos(targetPos)
      const el = domAtPos.node instanceof Element ? domAtPos.node : domAtPos.node.parentElement
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('memo-highlight-flash')
        setTimeout(() => el.classList.remove('memo-highlight-flash'), 1500)
      }
    }
  }, [editor, node.attrs])

  return (
    <NodeViewWrapper className="my-2.5" data-drag-handle>
      <div
        className={`memo-card group ${selected ? 'ring-1 ring-indigo-300 ring-offset-1' : ''}`}
        style={{ '--memo-accent': accent.bar } as React.CSSProperties}
      >
        {/* Row 1: type dot + memo text */}
        <div className="memo-card__row1">
          <span className="memo-card__type-dot" style={{ background: accent.bar }} />
          {editing ? (
            <div className="flex-1 min-w-0">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => handleSave('blur')}
                placeholder="Write your feedback..."
                className="memo-card__textarea"
                rows={2}
              />
              <div className="text-right">
                <span className="text-[11px] text-mf-faint">Enter · Shift+Enter · Esc</span>
              </div>
            </div>
          ) : (
            <p className="memo-card__text" onClick={() => setEditing(true)}>
              {node.attrs.text || 'Click to add feedback...'}
            </p>
          )}
        </div>

        {/* Row 2: status + anchor + actions */}
        <div className="memo-card__row2">
          {/* Status dropdown */}
          <div className="relative" ref={statusMenuRef}>
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className={`memo-card__status ${statusInfo.color}`}
              title="Change status"
            >
              {statusInfo.label}
              <ChevronDown size={10} />
            </button>
            {showStatusMenu && (() => {
              const options = STATUS_TRANSITIONS[status] || [status]
              return (
                <div
                  className="absolute top-full left-0 mt-1 z-[45] bg-mf-surface border border-mf-border rounded-md shadow-lg py-0.5 min-w-[100px]"
                  role="listbox"
                  aria-label="Status"
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedStatusIdx(i => Math.min(i + 1, options.length - 1)) }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedStatusIdx(i => Math.max(i - 1, 0)) }
                    else if (e.key === 'Enter' && focusedStatusIdx >= 0) { e.preventDefault(); updateAttributes({ status: options[focusedStatusIdx] }); setShowStatusMenu(false); setFocusedStatusIdx(-1); window.dispatchEvent(new CustomEvent('mf:flush-edit')) }
                    else if (e.key === 'Escape') { setShowStatusMenu(false); setFocusedStatusIdx(-1) }
                  }}
                  tabIndex={0}
                  ref={(el) => el?.focus()}
                >
                  {options.map((s, i) => (
                    <button
                      key={s}
                      role="option"
                      aria-selected={s === status}
                      onClick={() => { updateAttributes({ status: s }); setShowStatusMenu(false); setFocusedStatusIdx(-1); window.dispatchEvent(new CustomEvent('mf:flush-edit')) }}
                      className={`block w-full text-left px-3 py-1 text-[11px] hover-bg-mf-bg ${s === status ? 'font-bold' : ''} ${i === focusedStatusIdx ? 'bg-mf-bg' : ''} ${STATUS_LABELS[s].color}`}
                    >
                      {STATUS_LABELS[s].label}
                    </button>
                  ))}
                </div>
              )
            })()}
          </div>

          {/* Anchor text */}
          {node.attrs.anchorText && (
            <span
              className="memo-card__anchor"
              title="Scroll to highlight"
              onClick={handleScrollToHighlight}
            >
              {node.attrs.anchorText.slice(0, 35)}{node.attrs.anchorText.length > 35 ? '...' : ''}
            </span>
          )}

          <div className="flex-1" />

          {/* needs_review: approve + request changes */}
          {status === 'needs_review' && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => { updateAttributes({ status: 'done' }); window.dispatchEvent(new CustomEvent('mf:flush-edit')) }}
                className="memo-card__approve-btn"
                title="Approve"
              >
                <Check size={12} /> Approve
              </button>
              <button
                onClick={() => { updateAttributes({ status: 'open' }); window.dispatchEvent(new CustomEvent('mf:flush-edit')) }}
                className="memo-card__icon-btn"
                title="Request Changes"
              >
                <Undo2 size={12} />
              </button>
            </div>
          )}

          {/* answered: acknowledge */}
          {status === 'answered' && (
            <button
              onClick={() => { updateAttributes({ status: 'done' }); window.dispatchEvent(new CustomEvent('mf:flush-edit')) }}
              className="memo-card__icon-btn memo-card__icon-btn--approve"
              title="Acknowledge"
            >
              <Check size={12} />
            </button>
          )}

          {/* Hover actions: edit + delete */}
          <div className="memo-card__hover-actions">
            {!editing && (
              <button onClick={() => setEditing(true)} className="memo-card__icon-btn" title="Edit">
                <Pencil size={12} />
              </button>
            )}
            <button
              onClick={() => {
                if (pendingDelete) { clearTimeout(deleteTimerRef.current); setPendingDelete(false); handleDelete() }
                else { setPendingDelete(true); deleteTimerRef.current = window.setTimeout(() => setPendingDelete(false), 3000) }
              }}
              className={`memo-card__icon-btn memo-card__icon-btn--danger ${pendingDelete ? 'memo-card__icon-btn--confirming' : ''}`}
              title={pendingDelete ? 'Click again to confirm' : 'Delete'}
            >
              {pendingDelete ? <span className="text-[10px] font-medium">Delete?</span> : <X size={12} />}
            </button>
          </div>
        </div>

        {/* Reject reason */}
        {status === 'wontfix' && node.attrs.rejectReason && (
          <div className="px-3 pb-2 text-[12px] text-mf-faint italic">
            Reason: {node.attrs.rejectReason}
          </div>
        )}

        {/* Inline diff */}
        <MemoDiffSection memoId={node.attrs.memoId} />
      </div>
    </NodeViewWrapper>
  )
}

export default MemoBlock
