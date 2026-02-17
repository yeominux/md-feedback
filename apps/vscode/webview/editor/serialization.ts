/** Append memos that tiptap-markdown failed to serialize (shared fallback) */
export function appendMissedMemos(
  md: string,
  ed: { state: { doc: { descendants: (cb: (node: any) => void) => void } } },
): string {
  const appendMemos: string[] = []
  ed.state.doc.descendants((node: any) => {
    if (node.type.name !== 'memoBlock') return
    const { memoId, text, color, status } = node.attrs
    if (!memoId || md.includes(`id="${memoId}"`)) return
    const escaped = (text || '').replace(/-->/g, '--\u200B>')
    const statusAttr = status && status !== 'open' ? ` status="${status}"` : ''
    const comment = `<!-- USER_MEMO id="${memoId}" color="${color}"${statusAttr} : ${escaped} -->`
    appendMemos.push(comment)
  })
  if (appendMemos.length > 0) {
    md = md.trimEnd() + '\n\n' + appendMemos.join('\n') + '\n'
  }
  return md
}

/** Convert tiptap-markdown output to annotated markdown with memo comments */
export function serializeWithMemos(markdown: string): string {
  // Restore REVIEW_RESPONSE markers from container divs
  let result = markdown
    .replace(/<div\s[^>]*data-review-response[^>]*>/g, (match) => {
      const to = match.match(/data-response-to="([^"]*)"/)
      return to ? `<!-- REVIEW_RESPONSE to="${decodeHtmlEntities(to[1])}" -->` : match
    })
    .replace(/<\/div>\s*(?=\n|$)/g, (match, offset, str) => {
      // Only replace closing </div> that corresponds to a REVIEW_RESPONSE opening
      // Check if there's an unclosed REVIEW_RESPONSE marker before this </div>
      const before = str.slice(0, offset)
      const openCount = (before.match(/<!-- REVIEW_RESPONSE /g) || []).length
      const closeCount = (before.match(/<!-- \/REVIEW_RESPONSE -->/g) || []).length
      if (openCount > closeCount) {
        return '<!-- /REVIEW_RESPONSE -->'
      }
      return match
    })

  // Restore memo comments from memo block divs
  result = result.replace(
    /<div\s[^>]*data-memo-block[^>]*>[\s\S]*?<\/div>/g,
    (match) => {
      const id = match.match(/data-memo-id="([^"]*)"/)
      const text = match.match(/data-memo-text="([^"]*)"/)
      const color = match.match(/data-memo-color="([^"]*)"/)
      const status = match.match(/data-memo-status="([^"]*)"/)
      if (id && color) {
        const memoText = text ? decodeHtmlEntities(text[1]).replace(/\n/g, ' ').trim() : ''
        const statusAttr = status && status[1] !== 'open' ? ` status="${status[1]}"` : ''
        return `<!-- USER_MEMO id="${id[1]}" color="${color[1]}"${statusAttr} : ${memoText} -->`
      }
      // Preserve original HTML if extraction fails — never silently delete memos
      return match
    },
  )

  return result
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Collect all highlight marks from the ProseMirror doc and serialize them
 * as <!-- HIGHLIGHT_MARK --> HTML comments appended to the markdown.
 *
 * This is the counterpart to the empty Highlight serializer ({ open: '', close: '' }).
 * Without this, highlights vanish from markdown on every save cycle because
 * tiptap-markdown doesn't output <mark> tags (intentionally — to prevent
 * backslash accumulation from prosemirror-markdown escaping inside HTML).
 *
 * Format: <!-- HIGHLIGHT_MARK color="#hex" text="escaped" anchor="escaped" -->
 */
export function serializeHighlightMarks(
  md: string,
  ed: { state: { doc: { descendants: (cb: (node: any, pos: number) => any) => void } } },
): string {
  const marks: string[] = []

  ed.state.doc.descendants((node: any) => {
    if (!node.isTextblock) return

    const blockText: string = node.textContent
    if (!blockText) return

    // Collect highlighted fragments, merging adjacent same-color spans
    const fragments: { color: string; text: string }[] = []

    node.forEach((child: any) => {
      if (!child.isText || !child.text) return
      const hlMark = child.marks.find((m: any) => m.type.name === 'highlight')
      if (!hlMark) return

      const last = fragments[fragments.length - 1]
      if (last && last.color === hlMark.attrs.color) {
        last.text += child.text
      } else {
        fragments.push({ color: hlMark.attrs.color, text: child.text })
      }
    })

    for (const frag of fragments) {
      marks.push(
        `<!-- HIGHLIGHT_MARK color="${frag.color}" text="${escAttr(frag.text)}" anchor="${escAttr(blockText.slice(0, 80))}" -->`,
      )
    }
  })

  if (marks.length > 0) {
    md = md.trimEnd() + '\n\n' + marks.join('\n') + '\n'
  }
  return md
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
