import type { ReviewHighlight, ReviewMemo } from './types'
import { HEX_TO_COLOR_NAME } from './types'

export type FeedbackKind = 'fix' | 'question' | 'important'

export interface FeedbackItem {
  type: FeedbackKind
  text: string
  section: string
  context?: string
  feedback: string
}

interface CollectFeedbackOptions {
  floatingMemos?: FloatingMemoInput[]
}

/**
 * Legacy floating memo input used by markdown-roundtrip summary helpers.
 * This keeps legacy support isolated without depending on deprecated Memo.
 */
export interface FloatingMemoInput {
  color: string
  text: string
}

function toFeedbackType(color: string): FeedbackKind {
  return color === 'red' ? 'fix' : color === 'blue' ? 'question' : 'important'
}

export function collectFeedbackItems(
  highlights: ReviewHighlight[],
  docMemos: ReviewMemo[],
  options: CollectFeedbackOptions = {},
): FeedbackItem[] {
  const items: FeedbackItem[] = []
  const matchedHighlights = new Set<number>()
  const { floatingMemos = [] } = options

  for (const memo of docMemos) {
    const color = memo.color.startsWith('#') ? (HEX_TO_COLOR_NAME[memo.color] || 'red') : memo.color
    const type = toFeedbackType(color)
    const highlightColor = color === 'red' ? '#fca5a5' : color === 'blue' ? '#93c5fd' : '#fef08a'
    const memoSection = memo.section.trim()

    const highlightIndex = highlights.findIndex((highlight, idx) =>
      !matchedHighlights.has(idx) && highlight.color === highlightColor && highlight.section.trim() === memoSection,
    )

    if (highlightIndex >= 0) {
      matchedHighlights.add(highlightIndex)
      const highlight = highlights[highlightIndex]
      items.push({
        type,
        text: highlight.text,
        section: memo.section || highlight.section || '',
        context: highlight.context || '',
        feedback: memo.text,
      })
    } else {
      items.push({
        type,
        text: memo.context || '',
        section: memo.section || '',
        context: '',
        feedback: memo.text,
      })
    }
  }

  for (let i = 0; i < highlights.length; i++) {
    if (matchedHighlights.has(i)) continue
    const highlight = highlights[i]
    const color = HEX_TO_COLOR_NAME[highlight.color] || 'yellow'
    items.push({
      type: toFeedbackType(color),
      text: highlight.text,
      section: highlight.section || '',
      context: highlight.context || '',
      feedback: '',
    })
  }

  for (const memo of floatingMemos) {
    if (!memo.text.trim()) continue
    items.push({
      type: toFeedbackType(memo.color),
      text: '',
      section: '',
      context: '',
      feedback: memo.text,
    })
  }

  return items
}
