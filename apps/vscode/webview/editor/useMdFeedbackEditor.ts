import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { Markdown } from 'tiptap-markdown'
import type { Dispatch, SetStateAction, MutableRefObject } from 'react'
import { MemoBlock } from '../extensions/MemoBlock'
import { ReviewResponseBlock } from '../extensions/ReviewResponseBlock'
import CodeBlockHighlight from '../extensions/CodeBlockHighlight'
import CalloutExtension from '../extensions/CalloutBlock'
import MermaidBlock from '../extensions/MermaidBlock'
import type { HighlightColor } from '@md-feedback/shared'
import { appendMissedMemos, serializeWithMemos } from './serialization'

export interface DeletePopover {
  x: number
  y: number
  from: number
  to: number
  color: string
}

export interface UseMdFeedbackEditorOptions {
  onUpdate?: (annotatedMarkdown: string) => void
  onSelectionChange?: (hasSelection: boolean) => void
  savedSelectionRef: MutableRefObject<{ from: number; to: number } | null>
  applyAnnotationRef: MutableRefObject<(color: HighlightColor) => void>
  setDeletePopover: Dispatch<SetStateAction<DeletePopover | null>>
}

export function useMdFeedbackEditor({
  onUpdate,
  onSelectionChange,
  savedSelectionRef,
  applyAnnotationRef,
  setDeletePopover,
}: UseMdFeedbackEditorOptions) {
  return useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        codeBlock: false,
      }),
      Highlight.configure({
        multicolor: true,
        HTMLAttributes: { class: 'highlight' },
      }),
      Placeholder.configure({
        placeholder: 'Open a markdown file to start reviewing.',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'editor-link' },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: true }),
      MemoBlock,
      ReviewResponseBlock,
      CodeBlockHighlight,
      CalloutExtension,
      MermaidBlock,
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    editorProps: {
      attributes: {
        class: 'tiptap-editor tiptap-readonly',
      },
      handleKeyDown: (_view, event) => {
        const nav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Tab']
        if (nav.includes(event.key)) return false
        const mod = event.ctrlKey || event.metaKey
        if (mod && ['a', 'c', 'f', 'z'].includes(event.key.toLowerCase())) return false

        // Annotation shortcuts: 1 = Highlight, 2 = Fix, 3 = Question
        const sel = savedSelectionRef.current
        if (sel && sel.to - sel.from >= 2) {
          const key = event.key
          if (key === '1') {
            setTimeout(() => applyAnnotationRef.current('yellow'), 0)
            event.preventDefault()
            return true
          }
          if (key === '2') {
            setTimeout(() => applyAnnotationRef.current('red'), 0)
            event.preventDefault()
            return true
          }
          if (key === '3') {
            setTimeout(() => applyAnnotationRef.current('blue'), 0)
            event.preventDefault()
            return true
          }
        }

        event.preventDefault()
        return true
      },
      handlePaste: () => true,
      handleDrop: () => true,
      handleTextInput: () => true,
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to } = ed.state.selection
      const hasSelection = to - from >= 2
      if (hasSelection) {
        savedSelectionRef.current = { from, to }
        setDeletePopover(null)
      } else {
        savedSelectionRef.current = null
      }
      onSelectionChange?.(hasSelection)
    },
    onUpdate: ({ editor: ed }) => {
      if (onUpdate) {
        let md = ed.storage.markdown.getMarkdown()
        md = serializeWithMemos(md)
        md = appendMissedMemos(md, ed)
        onUpdate(md)
      }
    },
  })
}
