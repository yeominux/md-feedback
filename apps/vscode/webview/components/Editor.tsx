import { EditorContent, BubbleMenu } from '@tiptap/react'
import { useCallback, forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react'
import {
  type HighlightColor,
  type HighlightMark,
  type ReviewHighlight,
  type ReviewMemo,
} from '@md-feedback/shared'
import { appendMissedMemos, serializeWithMemos, serializeHighlightMarks } from '../editor/serialization'
import { applyAnnotation, deleteAnnotationMark, findMarkRange } from '../editor/annotations'
import { useMdFeedbackEditor, type DeletePopover } from '../editor/useMdFeedbackEditor'
import { Highlighter, Strikethrough, CircleHelp, Trash2 } from 'lucide-react'

export interface EditorHandle {
  getMarkdown: () => string
  getAnnotatedMarkdown: () => string
  setMarkdown: (md: string) => void
  getMemos: () => ReviewMemo[]
  getHighlights: () => ReviewHighlight[]
  getDocumentTitle: () => string
  getSections: () => string[]
  applyAnnotation: (color: HighlightColor) => void
  applyHighlightMarks: (marks: HighlightMark[]) => void
  scrollToMemo: (memoId: string) => void
}

interface EditorProps {
  onUpdate?: (annotatedMarkdown: string) => void
  onSelectionChange?: (hasSelection: boolean) => void
}

const Editor = forwardRef<EditorHandle, EditorProps>(({ onUpdate: onUpdateProp, onSelectionChange }, ref) => {
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null)
  const applyAnnotationRef = useRef<(color: HighlightColor) => void>(() => {})
  const [deletePopover, setDeletePopover] = useState<DeletePopover | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const editor = useMdFeedbackEditor({
    onUpdate: onUpdateProp,
    onSelectionChange,
    savedSelectionRef,
    applyAnnotationRef,
    setDeletePopover,
  })

  // Click-to-delete: detect clicks on marked text
  useEffect(() => {
    if (!editor) return
    const el = editor.view.dom

    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return

      const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })
      if (!pos) { setDeletePopover(null); return }

      try {
        const resolved = editor.state.doc.resolve(pos.pos)
        const marks = resolved.marks()
        const hlMark = marks.find((m: any) => m.type.name === 'highlight')

        if (hlMark) {
          const range = findMarkRange(editor.state.doc, pos.pos, 'highlight', hlMark.attrs.color)
          if (range) {
            setDeletePopover({
              x: Math.max(80, Math.min(e.clientX, window.innerWidth - 80)),
              y: e.clientY,
              from: range.from,
              to: range.to,
              color: hlMark.attrs.color,
            })
            return
          }
        }
      } catch { /* ignore resolve errors */ }
      setDeletePopover(null)
    }

    el.addEventListener('click', handleClick)
    return () => el.removeEventListener('click', handleClick)
  }, [editor])

  // Dismiss popover on outside click
  useEffect(() => {
    if (!deletePopover) return
    const dismiss = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return
      setDeletePopover(null)
    }
    const timer = setTimeout(() => document.addEventListener('click', dismiss), 10)
    return () => { clearTimeout(timer); document.removeEventListener('click', dismiss) }
  }, [deletePopover])

  useImperativeHandle(ref, () => ({
    getMarkdown: () => {
      if (!editor) return ''
      return editor.storage.markdown.getMarkdown()
    },
    getAnnotatedMarkdown: () => {
      if (!editor) return ''
      let md = editor.storage.markdown.getMarkdown()
      md = serializeWithMemos(md)
      md = appendMissedMemos(md, editor)
      md = serializeHighlightMarks(md, editor)
      return md
    },
    setMarkdown: (md: string) => {
      if (!editor) return
      try {
        editor.commands.setContent(md)
      } catch (error) {
        // Fallback: try setting as plain text wrapped in paragraph
        console.warn('md-feedback: markdown parsing failed, using fallback', error)
        try {
          editor.commands.setContent(`<p>${md.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        } catch {
          // Last resort: clear editor
          editor.commands.clearContent()
        }
      }
    },
    getDocumentTitle: () => {
      if (!editor) return ''
      let title = ''
      editor.state.doc.descendants((node) => {
        if (!title && node.type.name === 'heading') {
          title = node.textContent
          return false
        }
      })
      return title
    },
    getHighlights: () => {
      if (!editor) return []
      const highlights: ReviewHighlight[] = []
      let currentSection = ''

      // Block-level traversal: merge highlight fragments per block + color
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          currentSection = node.textContent
          return
        }
        // Only process textblock nodes (paragraph, etc.)
        if (!node.isTextblock) return

        const context = node.textContent
        const blockHighlights: Map<string, string[]> = new Map() // color → text fragments

        node.descendants((child) => {
          if (child.isText && child.marks.length > 0) {
            const hlMark = child.marks.find(m => m.type.name === 'highlight')
            if (hlMark && child.text) {
              const color = hlMark.attrs.color || '#fef08a'
              if (!blockHighlights.has(color)) blockHighlights.set(color, [])
              blockHighlights.get(color)!.push(child.text)
            }
          }
        })

        for (const [color, texts] of blockHighlights) {
          highlights.push({
            text: texts.join(''),  // Same block + same color → always merge
            color,
            section: currentSection,
            context,
          })
        }
      })

      return highlights
    },
    getMemos: () => {
      if (!editor) return []
      const memos: ReviewMemo[] = []
      let currentSection = ''
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') currentSection = node.textContent
        if (node.type.name === 'memoBlock') {
          let context = ''
          const resolved = editor.state.doc.resolve(pos)
          if (resolved.index(0) > 0) {
            context = editor.state.doc.child(resolved.index(0) - 1).textContent
          }
          memos.push({
            id: node.attrs.memoId,
            text: node.attrs.text,
            color: node.attrs.color,
            section: currentSection,
            context,
          })
        }
      })
      return memos
    },
    getSections: () => {
      if (!editor) return []
      const sections: string[] = []
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'heading' && node.attrs.level === 2) {
          const text = node.textContent.trim()
          if (text) sections.push(text)
        }
      })
      return sections
    },
    applyAnnotation: (color: HighlightColor) => {
      applyAnnotationRef.current(color)
    },
    applyHighlightMarks: (marks: HighlightMark[]) => {
      if (!editor || marks.length === 0) return

      const highlightType = editor.schema.marks.highlight
      if (!highlightType) return

      let tr = editor.state.tr
      const applied = new Set<string>()

      for (const mark of marks) {
        const key = `${mark.color}|${mark.text}|${mark.anchor}`
        if (applied.has(key)) continue

        // Find textblocks matching the anchor
        editor.state.doc.descendants((node: any, pos: number) => {
          if (applied.has(key)) return false
          if (!node.isTextblock) return

          const blockText: string = node.textContent
          if (!blockText) return

          // Match by anchor prefix (first 40 chars)
          const anchorPrefix = mark.anchor.slice(0, 40)
          if (anchorPrefix && !blockText.includes(anchorPrefix)) return

          // Find the highlighted text within this block
          const textIdx = blockText.indexOf(mark.text)
          if (textIdx < 0) return

          // Map textContent offset to ProseMirror position by walking children
          let charsSeen = 0
          let from = -1
          let to = -1

          node.forEach((child: any, childOffset: number) => {
            if (from >= 0 && to >= 0) return
            const childStart = pos + 1 + childOffset

            if (child.isText && child.text) {
              const textLen = child.text.length
              const childEnd = charsSeen + textLen

              if (from < 0 && textIdx < childEnd) {
                from = childStart + (textIdx - charsSeen)
              }
              if (from >= 0 && to < 0 && textIdx + mark.text.length <= childEnd) {
                to = childStart + (textIdx + mark.text.length - charsSeen)
              }

              charsSeen += textLen
            } else {
              charsSeen += child.textContent?.length || 0
            }
          })

          if (from >= 0 && to >= 0) {
            tr = tr.addMark(from, to, highlightType.create({ color: mark.color }))
            applied.add(key)
          }
        })
      }

      if (tr.steps.length > 0) {
        // Don't add to undo history — this is a reconstruction, not a user edit
        tr.setMeta('addToHistory', false)
        editor.view.dispatch(tr)
      }
    },
    scrollToMemo: (memoId: string) => {
      if (!editor) return
      let targetPos = -1
      editor.state.doc.descendants((node: any, pos: number) => {
        if (targetPos >= 0) return false
        if (node.type.name === 'memoBlock' && node.attrs.memoId === memoId) {
          targetPos = pos
        }
      })
      if (targetPos >= 0) {
        // Use nodeDOM for atom nodes — domAtPos returns the parent container,
        // not the memo element itself, so scrollIntoView targets the wrong element.
        const dom = editor.view.nodeDOM(targetPos)
        const el = dom instanceof HTMLElement ? dom : (dom as Node | null)?.parentElement as HTMLElement | null
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('memo-highlight-flash')
          setTimeout(() => el.classList.remove('memo-highlight-flash'), 1500)
        }
      }
    },
  }))

  const handleApplyAnnotation = useCallback((color: HighlightColor) => {
    applyAnnotation(editor, savedSelectionRef.current, color)
  }, [editor])

  // Keep ref in sync for keyboard shortcuts
  useEffect(() => {
    applyAnnotationRef.current = handleApplyAnnotation
  }, [handleApplyAnnotation])

  // Delete a mark (and its associated memo if fix/question)
  const handleDeleteMark = useCallback(() => {
    if (!editor || !deletePopover) return
    deleteAnnotationMark(editor, deletePopover)
    setDeletePopover(null)
  }, [editor, deletePopover])

  if (!editor) return null

  return (
    <div className="relative">
      <BubbleMenu
        editor={editor}
        tippyOptions={{
          duration: [200, 150],
          placement: 'top',
          delay: [150, 0],
          appendTo: () => document.querySelector('.md-feedback-root') || document.body,
        }}
        className="bubble-menu-glass"
      >
        <div className="flex items-center">
          {/* Primary: Highlight */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleApplyAnnotation('yellow')}
            className="bubble-btn bubble-btn-primary"
            title="Personal reading mark"
          >
            <span className="bubble-icon">
              <Highlighter size={18} style={{ color: 'var(--mf-accent-highlight)' }} />
            </span>
            <span className="bubble-label text-mf-memo-highlight">Highlight</span>
            <kbd className="bubble-kbd">1</kbd>
          </button>

          <div className="bubble-sep" />

          {/* Secondary: Fix — AI will change the document */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleApplyAnnotation('red')}
            className="bubble-btn"
            title="AI will change your document"
          >
            <span className="bubble-icon">
              <Strikethrough size={18} style={{ color: 'var(--mf-accent-fix)' }} />
            </span>
            <span className="bubble-label text-mf-accent-fix">Fix</span>
            <kbd className="bubble-kbd">2</kbd>
          </button>

          <div className="bubble-sep" />

          {/* Secondary: Question — AI will write a response */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleApplyAnnotation('blue')}
            className="bubble-btn"
            title="AI will write a response"
          >
            <span className="bubble-icon">
              <CircleHelp size={18} style={{ color: 'var(--mf-accent-question)' }} />
            </span>
            <span className="bubble-label text-mf-accent-question">Question</span>
            <kbd className="bubble-kbd">3</kbd>
          </button>
        </div>
      </BubbleMenu>

      <EditorContent
        editor={editor}
        className="min-h-[70vh] focus-within:outline-none"
      />

      {/* Delete mark popover */}
      {deletePopover && (
        <div
          ref={popoverRef}
          className="delete-popover"
          style={{
            position: 'fixed',
            left: deletePopover.x,
            top: deletePopover.y - 40,
          }}
        >
          <button className="delete-popover-btn" onClick={handleDeleteMark}>
            <Trash2 size={12} />
            <span>Remove</span>
          </button>
        </div>
      )}
    </div>
  )
})

Editor.displayName = 'Editor'
export default Editor
