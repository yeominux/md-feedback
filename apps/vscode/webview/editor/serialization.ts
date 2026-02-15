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
  return markdown.replace(
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
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
