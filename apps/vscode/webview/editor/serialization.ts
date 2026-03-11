import { escAttrValue, colorToType } from '@md-feedback/shared'

/** Append memos that tiptap-markdown failed to serialize (shared fallback).
 *  Outputs v0.4 multi-line format to preserve all fields through roundtrip. */
export function appendMissedMemos(
  md: string,
  ed: { state: { doc: { descendants: (cb: (node: any) => void) => void } } },
): string {
  const appendMemos: string[] = []
  ed.state.doc.descendants((node: any) => {
    if (node.type.name !== 'memoBlock') return
    const a = node.attrs
    if (!a.memoId || md.includes(`id="${a.memoId}"`)) return
    const lines = [
      '<!-- USER_MEMO',
      `  id="${escAttrValue(a.memoId)}"`,
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
    appendMemos.push(lines.join('\n'))
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

  // Restore memo comments from memo block divs (v0.4 multi-line format)
  result = result.replace(
    /<div\s[^>]*data-memo-block[^>]*>[\s\S]*?<\/div>/g,
    (match) => {
      const get = (attr: string) => {
        const m = match.match(new RegExp(`${attr}="([^"]*)"`))
        return m ? decodeHtmlEntities(m[1]) : ''
      }
      const id = get('data-memo-id')
      const color = get('data-memo-color')
      if (!id || !color) return match // preserve original if extraction fails
      const text = get('data-memo-text')
      const status = get('data-memo-status') || 'open'
      const anchorText = get('data-memo-anchor')
      const memoType = get('data-memo-type') || colorToType(color)
      const owner = get('data-memo-owner') || 'human'
      const source = get('data-memo-source') || 'generic'
      const created = get('data-memo-created') || new Date().toISOString()
      const updated = get('data-memo-updated') || new Date().toISOString()
      const anchorHash = get('data-memo-anchor-hash')
      const reject = get('data-memo-reject')
      const lines = [
        '<!-- USER_MEMO',
        `  id="${escAttrValue(id)}"`,
        `  type="${memoType}"`,
        `  status="${status}"`,
        `  owner="${owner}"`,
        `  source="${escAttrValue(source)}"`,
        `  color="${color}"`,
        `  text="${escAttrValue(text)}"`,
        `  anchorText="${escAttrValue(anchorText)}"`,
        `  anchor="${escAttrValue(anchorHash)}"`,
        `  createdAt="${created}"`,
        `  updatedAt="${updated}"`,
      ]
      if (reject) lines.push(`  rejectReason="${escAttrValue(reject)}"`)
      lines.push('-->')
      return lines.join('\n')
    },
  )

  // Collapse accumulated backslash escapes from prosemirror-markdown's esc()
  // which doubles backslashes on every save/load cycle (C:\folder → C:\\folder → C:\\\\folder).
  // Preserve code blocks as-is.
  result = collapseBackslashes(result)

  return result
}

/** Collapse excessive backslash escaping outside fenced code blocks */
export function collapseBackslashes(md: string): string {
  const parts = md.split(/(^```[\s\S]*?^```)/gm)
  return parts.map((part, i) => {
    if (i % 2 === 1) return part // code block — preserve
    // Collapse double+ escaped backslashes before markdown special chars
    return part.replace(/\\{2,}([`*~\[\]_\\()|.!#>\-])/g, '\\$1')
  }).join('')
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
  // Phase 1: Collect per-block highlight data in document order.
  const blockEntries: { blockText: string; colorTexts: Map<string, string> }[] = []

  ed.state.doc.descendants((node: any) => {
    if (!node.isTextblock) return

    const blockText: string = node.textContent
    if (!blockText) return

    // Collect highlighted fragments per color within the same block.
    // This avoids emitting one HIGHLIGHT_MARK per tiny text fragment.
    const fragmentsByColor: Map<string, string[]> = new Map()

    node.forEach((child: any) => {
      if (!child.isText || !child.text) return
      const hlMark = child.marks.find((m: any) => m.type.name === 'highlight')
      if (!hlMark) return

      const color = hlMark.attrs.color
      if (!fragmentsByColor.has(color)) fragmentsByColor.set(color, [])
      fragmentsByColor.get(color)!.push(child.text)
    })

    const colorTexts = new Map<string, string>()
    for (const [color, texts] of fragmentsByColor.entries()) {
      const merged = texts.join(' ').trim()
      if (merged) colorTexts.set(color, merged)
    }

    // Record even blocks without highlights so they break adjacency.
    blockEntries.push({ blockText, colorTexts })
  })

  // Phase 2: Merge adjacent blocks that share the same highlight color.
  // Adjacent = consecutive blocks where both have highlights of a given color,
  // with no unhighlighted or differently-colored block in between.
  const marks: string[] = []

  // Track per-color running merge state.
  const running: Map<string, { texts: string[]; anchor: string }> = new Map()

  const flushColor = (color: string) => {
    const r = running.get(color)
    if (!r || r.texts.length === 0) return
    marks.push(
      `<!-- HIGHLIGHT_MARK color="${color}" text="${escAttr(r.texts.join(' '))}" anchor="${escAttr(r.anchor)}" -->`,
    )
    running.delete(color)
  }

  for (const entry of blockEntries) {
    // For each color currently running, if this block does NOT have that color,
    // flush the run (adjacency broken).
    for (const color of [...running.keys()]) {
      if (!entry.colorTexts.has(color)) {
        flushColor(color)
      }
    }

    // For each color in this block, extend or start a run.
    for (const [color, text] of entry.colorTexts.entries()) {
      const r = running.get(color)
      if (r) {
        r.texts.push(text)
      } else {
        running.set(color, { texts: [text], anchor: entry.blockText.slice(0, 80) })
      }
    }
  }

  // Flush remaining runs.
  for (const color of [...running.keys()]) {
    flushColor(color)
  }

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
