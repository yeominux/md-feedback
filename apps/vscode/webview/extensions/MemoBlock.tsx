import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { MEMO_ACCENT, HIGHLIGHT_COLORS, escAttrValue, colorToType, type MemoColor, type MemoStatus, type HighlightColor, type MemoImpl } from '@md-feedback/shared'
import { Pencil, X, ChevronDown, Check, Undo2, AlertTriangle } from 'lucide-react'

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
      memoId:          { default: '' },
      text:            { default: '' },
      color:           { default: 'red' as MemoColor },
      anchorText:      { default: '' },
      status:          { default: 'open' as MemoStatus },
      rejectReason:    { default: '' },
      // v0.4 fields preserved through TipTap roundtrip
      memoType:          { default: '' },
      memoOwner:         { default: '' },
      memoSource:        { default: '' },
      memoCreated:       { default: '' },
      memoUpdated:       { default: '' },
      memoAnchorHash:    { default: '' },
      anchorConfidence:  { default: '' },
    }
  },

  parseHTML() {
    return [{
      tag: 'div[data-memo-block]',
      getAttrs: (el) => {
        const element = el as HTMLElement
        return {
          memoId:         element.getAttribute('data-memo-id') || '',
          text:           element.getAttribute('data-memo-text') || '',
          color:          element.getAttribute('data-memo-color') || 'red',
          status:         element.getAttribute('data-memo-status') || 'open',
          anchorText:     element.getAttribute('data-memo-anchor') || '',
          memoType:       element.getAttribute('data-memo-type') || '',
          memoOwner:      element.getAttribute('data-memo-owner') || '',
          memoSource:     element.getAttribute('data-memo-source') || '',
          memoCreated:    element.getAttribute('data-memo-created') || '',
          memoUpdated:    element.getAttribute('data-memo-updated') || '',
          memoAnchorHash:  element.getAttribute('data-memo-anchor-hash') || '',
          rejectReason:    element.getAttribute('data-memo-reject') || '',
          anchorConfidence: element.getAttribute('data-memo-confidence') || '',
        }
      },
    }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-memo-block': '',
      'data-memo-id':     HTMLAttributes.memoId,
      'data-memo-text':   HTMLAttributes.text,
      'data-memo-color':  HTMLAttributes.color,
      'data-memo-status': HTMLAttributes.status || 'open',
      'data-memo-anchor': HTMLAttributes.anchorText || '',
      'data-memo-type':   HTMLAttributes.memoType || '',
      'data-memo-owner':  HTMLAttributes.memoOwner || '',
      'data-memo-source': HTMLAttributes.memoSource || '',
      'data-memo-created':     HTMLAttributes.memoCreated || '',
      'data-memo-updated':     HTMLAttributes.memoUpdated || '',
      'data-memo-anchor-hash': HTMLAttributes.memoAnchorHash || '',
      'data-memo-reject':      HTMLAttributes.rejectReason || '',
      'data-memo-confidence':  HTMLAttributes.anchorConfidence || '',
    }), `memo: ${HTMLAttributes.text || ''}`]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const a = node.attrs
          const lines = [
            '<!-- USER_MEMO',
            `  id="${escAttrValue(a.memoId || '')}"`,
            `  type="${a.memoType || colorToType(a.color || 'red')}"`,
            `  status="${a.status || 'open'}"`,
            `  owner="${a.memoOwner || 'human'}"`,
            `  source="${escAttrValue(a.memoSource || 'generic')}"`,
            `  color="${a.color || 'red'}"`,
            `  text="${escAttrValue(a.text || '')}"`,
            `  anchorText="${escAttrValue(a.anchorText || '')}"`,
            `  anchor="${escAttrValue(a.memoAnchorHash || '')}"`,
            `  createdAt="${a.memoCreated || new Date().toISOString()}"`,
            `  updatedAt="${a.memoUpdated || new Date().toISOString()}"`,
          ]
          if (a.rejectReason) lines.push(`  rejectReason="${escAttrValue(a.rejectReason)}"`)
          lines.push('-->')
          state.write(lines.join('\n'))
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
  open:         ['open', 'in_progress', 'done', 'wontfix'],
  in_progress:  ['in_progress', 'open', 'done', 'failed'],
  needs_review: ['needs_review', 'open', 'done', 'wontfix'],
  answered:     ['answered', 'open', 'done'],
  done:         ['done', 'open'],
  failed:       ['failed', 'open'],
  wontfix:      ['wontfix', 'open'],
}

const TYPE_OPTIONS: { color: MemoColor; label: string; desc: string }[] = [
  { color: 'red', label: 'Fix', desc: 'AI will change your document' },
  { color: 'blue', label: 'Question', desc: 'AI will write a response' },
  { color: 'yellow', label: 'Highlight', desc: 'Personal reading mark' },
]

function MemoBlockView({ node, updateAttributes, deleteNode, selected, editor }: any) {
  const [editing, setEditing] = useState(!node.attrs.text)
  const [text, setText] = useState(node.attrs.text || '')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [focusedStatusIdx, setFocusedStatusIdx] = useState(-1)
  const [focusedTypeIdx, setFocusedTypeIdx] = useState(-1)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const statusMenuRef = useRef<HTMLDivElement>(null)
  const typeMenuRef = useRef<HTMLDivElement>(null)
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

  // Close type menu on click outside
  useEffect(() => {
    if (!showTypeMenu) return
    const handleClick = (e: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as globalThis.Node)) {
        setShowTypeMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTypeMenu])

  // Switch memo type and re-color the associated highlight mark
  const handleTypeChange = useCallback((newColor: MemoColor) => {
    if (newColor === color) { setShowTypeMenu(false); return }

    const oldHighlight = HIGHLIGHT_COLORS[color as HighlightColor]
    const newHighlight = HIGHLIGHT_COLORS[newColor as HighlightColor]

    // Re-color the highlight mark in the editor
    if (editor && oldHighlight && newHighlight) {
      const markType = editor.schema.marks.highlight
      let memoPos = -1
      editor.state.doc.descendants((n: any, pos: number) => {
        if (memoPos >= 0) return false
        if (n.type.name === 'memoBlock' && n.attrs.memoId === node.attrs.memoId) {
          memoPos = pos; return false
        }
      })

      if (memoPos >= 0) {
        let bestFrom = -1, bestTo = -1
        editor.state.doc.descendants((textNode: any, nodePos: number) => {
          if (nodePos >= memoPos) return false
          if (!textNode.isText) return
          const hasMark = textNode.marks.some((m: any) =>
            m.type === markType && m.attrs.color === oldHighlight,
          )
          if (hasMark) {
            if (bestTo === nodePos) { bestTo = nodePos + textNode.nodeSize }
            else { bestFrom = nodePos; bestTo = nodePos + textNode.nodeSize }
          }
        })

        if (bestFrom >= 0) {
          const tr = editor.state.tr
            .removeMark(bestFrom, bestTo, markType)
            .addMark(bestFrom, bestTo, markType.create({ color: newHighlight }))
          editor.view.dispatch(tr)
        }
      }
    }

    updateAttributes({ color: newColor })
    setShowTypeMenu(false)
    setFocusedTypeIdx(-1)
    window.dispatchEvent(new CustomEvent('mf:flush-edit'))
  }, [color, editor, node.attrs.memoId, updateAttributes])

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

  const isDone = status === 'done' || status === 'wontfix' || status === 'failed'

  return (
    <NodeViewWrapper className="my-2" data-drag-handle>
      <div
        className={`memo-card group ${selected ? 'ring-1 ring-indigo-300 ring-offset-1' : ''} ${isDone ? 'memo-card--resolved' : ''}`}
        style={{ '--memo-accent': accent.bar } as React.CSSProperties}
      >
        {/* Header: type pill + status + actions */}
        <div className="memo-card__header">
          {/* Type pill — clickable to switch type */}
          <div className="relative" ref={typeMenuRef}>
            <button
              onClick={() => setShowTypeMenu(!showTypeMenu)}
              className={`memo-card__type-pill memo-card__type-pill--${color}`}
              title={accent.desc}
            >
              {accent.label}
              <ChevronDown size={9} style={{ opacity: 0.5 }} />
            </button>
            {showTypeMenu && (
              <div
                className="absolute top-full left-0 mt-1 z-[45] bg-mf-surface border border-mf-border rounded-md shadow-lg py-1 min-w-[160px]"
                role="listbox"
                aria-label="Memo type"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedTypeIdx(i => Math.min(i + 1, TYPE_OPTIONS.length - 1)) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedTypeIdx(i => Math.max(i - 1, 0)) }
                  else if (e.key === 'Enter' && focusedTypeIdx >= 0) { e.preventDefault(); handleTypeChange(TYPE_OPTIONS[focusedTypeIdx].color) }
                  else if (e.key === 'Escape') { setShowTypeMenu(false); setFocusedTypeIdx(-1) }
                }}
                tabIndex={0}
                ref={(el) => el?.focus()}
              >
                {TYPE_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.color}
                    role="option"
                    aria-selected={opt.color === color}
                    onClick={() => handleTypeChange(opt.color)}
                    className={`block w-full px-3 py-1.5 text-xs hover:bg-[var(--mf-hover)] ${opt.color === color ? 'font-bold' : ''} ${i === focusedTypeIdx ? 'bg-[var(--mf-hover)]' : ''}`}
                    style={{ textAlign: 'left' }}
                  >
                    <span className={`memo-card__type-pill memo-card__type-pill--${opt.color}`} style={{ display: 'inline', padding: '1px 6px', fontSize: '10px' }}>
                      {opt.label}
                    </span>
                    <span className="text-mf-faint ml-2">{opt.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status dropdown */}
          <div className="relative" ref={statusMenuRef}>
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className={`memo-card__status-btn ${statusInfo.color} ${statusInfo.bg}`}
              title="Change status"
            >
              {statusInfo.label}
              <ChevronDown size={10} />
            </button>
            {showStatusMenu && (() => {
              const options = STATUS_TRANSITIONS[status] || [status]
              return (
                <div
                  className="absolute top-full left-0 mt-1 z-[45] bg-mf-surface border border-mf-border rounded-md shadow-lg py-1 min-w-[120px]"
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
                      className={`block w-full px-3 py-1.5 text-xs hover-bg-mf-bg ${s === status ? 'font-bold' : ''} ${i === focusedStatusIdx ? 'bg-mf-bg' : ''} ${STATUS_LABELS[s].color}`}
                      style={{ textAlign: 'left' }}
                    >
                      {STATUS_LABELS[s].label}
                    </button>
                  ))}
                </div>
              )
            })()}
          </div>

          <div className="flex-1" />

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

        {/* Body: memo text */}
        <div className="memo-card__body">
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
                <span className="text-xs text-mf-faint">Enter · Shift+Enter · Esc</span>
              </div>
            </div>
          ) : (
            <p className={`memo-card__text ${isDone ? 'memo-card__text--done' : ''}`} onClick={() => setEditing(true)}>
              {node.attrs.text || 'Click to add feedback...'}
            </p>
          )}
        </div>

        {/* Footer: anchor + action buttons */}
        <div className="memo-card__footer">
          {/* Anchor text with confidence warning */}
          {node.attrs.anchorText && (
            <span
              className="memo-card__anchor"
              title="Scroll to highlight"
              onClick={handleScrollToHighlight}
            >
              {(node.attrs.anchorConfidence === 'line_number' || node.attrs.anchorConfidence === 'fallback') && (
                <AlertTriangle size={11} className="inline-block mr-1 text-amber-500" title="Anchor position may be inaccurate" />
              )}
              {node.attrs.anchorText.slice(0, 40)}{node.attrs.anchorText.length > 40 ? '...' : ''}
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
