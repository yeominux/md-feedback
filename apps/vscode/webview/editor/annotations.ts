import { nanoid } from 'nanoid'
import { HIGHLIGHT_COLORS, HEX_TO_COLOR_NAME, type HighlightColor } from '@md-feedback/shared'

/** Find the continuous range of a highlight mark at a given position */
export function findMarkRange(
  doc: any,
  pos: number,
  markTypeName: string,
  color: string,
): { from: number; to: number } | null {
  try {
    const $pos = doc.resolve(pos)
    const parent = $pos.parent
    const start = pos - $pos.parentOffset

    const ranges: { from: number; to: number }[] = []
    let cur: { from: number; to: number } | null = null

    parent.forEach((child: any, offset: number) => {
      const childStart = start + offset
      const childEnd = childStart + child.nodeSize
      const hasMark = child.isText && child.marks.some((m: any) =>
        m.type.name === markTypeName && m.attrs.color === color,
      )
      if (hasMark) {
        cur = cur ? { from: cur.from, to: childEnd } : { from: childStart, to: childEnd }
      } else if (cur) {
        ranges.push(cur)
        cur = null
      }
    })
    if (cur) ranges.push(cur)

    return ranges.find(r => pos >= r.from && pos <= r.to) || null
  } catch {
    return null
  }
}

export interface AnnotationSelection {
  from: number
  to: number
}

export function applyAnnotation(
  editor: any,
  selection: AnnotationSelection | null,
  color: HighlightColor,
): void {
  if (!editor) return

  if (!selection || selection.from === selection.to) return

  const { from, to } = selection

  editor.chain().focus().setTextSelection({ from, to }).run()

  const highlightMark = editor.schema.marks.highlight
  let hasSameMark = false
  editor.state.doc.nodesBetween(from, to, (node: any) => {
    if (node.isText && node.marks.some(m =>
      m.type === highlightMark && m.attrs.color === HIGHLIGHT_COLORS[color],
    )) {
      hasSameMark = true
    }
  })

  if (hasSameMark) {
    editor.chain().focus().setTextSelection({ from, to }).unsetHighlight().run()
    return
  }

  editor.chain().focus().setTextSelection({ from, to }).setHighlight({ color: HIGHLIGHT_COLORS[color] }).run()

  // Fix / Question: also insert a memo card
  if (color !== 'yellow') {
    const resolved = editor.state.doc.resolve(to)
    const selectedText = editor.state.doc.textBetween(from, to, ' ')

    // B-1: If inside a table, insert memo AFTER the table.
    // Memos inside table cells can't survive the markdown serialization roundtrip
    // because convertMemosToHtml() only parses standalone memo lines.
    let insertPos: number
    let isInTable = false
    for (let d = resolved.depth; d >= 0; d--) {
      if (resolved.node(d).type.name === 'table') {
        insertPos = resolved.after(d)
        isInTable = true
        break
      }
    }
    if (!isInTable) {
      insertPos = resolved.end(resolved.depth) + 1
    }

    editor
      .chain()
      .insertContentAt(insertPos!, {
        type: 'memoBlock',
        attrs: {
          memoId: nanoid(8),
          text: '',
          color,
          anchorText: selectedText.slice(0, 80),
        },
      })
      .run()
  }
}

export interface DeleteAnnotationRange {
  from: number
  to: number
  color: string
}

export function deleteAnnotationMark(editor: any, range: DeleteAnnotationRange): void {
  if (!editor) return

  const { from, to, color } = range

  const markedText = editor.state.doc.textBetween(from, to, ' ')
  const colorName = HEX_TO_COLOR_NAME[color]
  const markType = editor.schema.marks.highlight

  let tr = editor.state.tr
  tr = tr.removeMark(from, to, markType)

  // Cascade: remove associated memo for fix/question
  if (colorName && colorName !== 'yellow') {
    let memoPos = -1
    let memoSize = 0
    editor.state.doc.descendants((node: any, pos: number) => {
      if (memoPos >= 0) return false
      if (
        node.type.name === 'memoBlock' &&
        node.attrs.color === colorName &&
        node.attrs.anchorText &&
        markedText.includes(node.attrs.anchorText.slice(0, 20))
      ) {
        memoPos = pos
        memoSize = node.nodeSize
        return false
      }
    })

    if (memoPos >= 0) {
      tr = tr.delete(memoPos, memoPos + memoSize)
    }
  }

  editor.view.dispatch(tr)
}
