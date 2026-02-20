import type { Memo, MemoV2, ReviewHighlight, ReviewMemo, Checkpoint, HighlightMark } from './types'
import { HEX_TO_COLOR_NAME } from './types'
import { splitDocument } from './document-writer'
import { collectFeedbackItems } from './feedback-collector'
import type { FloatingMemoInput } from './feedback-collector'
import { truncateText } from './utils'

const HEX_TO_COLOR = HEX_TO_COLOR_NAME

function normalizeMemoColor(color: string | undefined): string {
  if (!color) return 'red'
  if (color === 'red' || color === 'blue' || color === 'yellow') return color
  const normalized = HEX_TO_COLOR[color.toLowerCase()]
  if (normalized === 'red' || normalized === 'blue' || normalized === 'yellow') return normalized
  return 'red'
}

/**
 * Convert USER_MEMO comments to <div data-memo-block> HTML that TipTap can parse.
 * Also strips non-visual metadata (GATE, PLAN_CURSOR, CHECKPOINT).
 * This preserves memo data through the save/reload cycle.
 */
export function convertMemosToHtml(markdown: string): string {
  // B-1: Pre-process — extract USER_MEMO comments embedded inside table rows.
  // Memos inside table cells (e.g. `| text <!-- USER_MEMO ... --> | other |`)
  // can't be parsed by the line-by-line processor below. Move them to standalone
  // lines right after the table ends.
  const preLines = markdown.split('\n')
  const preResult: string[] = []
  const pendingTableMemos: string[] = []
  for (const pl of preLines) {
    const isTableRow = /^\s*\|.*\|\s*$/.test(pl)
    if (isTableRow && pl.includes('<!-- USER_MEMO')) {
      let clean = pl
      const inlineRe = /\s*<!-- USER_MEMO\s+id="[^"]+"\s+[^]*?-->/g
      let m: RegExpExecArray | null
      while ((m = inlineRe.exec(pl)) !== null) {
        pendingTableMemos.push(m[0].trim())
        clean = clean.replace(m[0], '')
      }
      preResult.push(clean)
    } else if (!isTableRow && pendingTableMemos.length > 0) {
      for (const pm of pendingTableMemos) preResult.push(pm)
      pendingTableMemos.length = 0
      preResult.push(pl)
    } else {
      preResult.push(pl)
    }
  }
  if (pendingTableMemos.length > 0) {
    for (const pm of pendingTableMemos) preResult.push(pm)
  }

  // B-2: Pre-process — extract USER_MEMO comments embedded inside blockquote lines.
  // When memos appear on blockquote lines (e.g. `> <!-- USER_MEMO ... -->`), the
  // `> ` prefix prevents the line-by-line processor from recognizing them.
  // Also handles multi-line v0.4 memos with `> ` prefix on every line.
  const bqResult: string[] = []
  for (let j = 0; j < preResult.length; j++) {
    const raw = preResult[j]
    // Check if this line is inside a blockquote and contains a memo start
    if (/^\s*>/.test(raw)) {
      const stripped = raw.replace(/^(?:\s*>\s*)+/, '')
      // v0.3 single-line: `> <!-- USER_MEMO id="..." ... : text -->`
      if (/^<!-- USER_MEMO\s+id="/.test(stripped) && stripped.trimEnd().endsWith('-->')) {
        bqResult.push(stripped)
        continue
      }
      // v0.4 multi-line start: `> <!-- USER_MEMO`
      if (/^<!-- USER_MEMO\s*$/.test(stripped.trim())) {
        bqResult.push(stripped)
        j++
        // Consume subsequent `> ` prefixed attribute lines until `> -->`
        while (j < preResult.length) {
          const nextRaw = preResult[j]
          const nextStripped = /^\s*>/.test(nextRaw) ? nextRaw.replace(/^(?:\s*>\s*)+/, '') : nextRaw
          bqResult.push(nextStripped)
          if (/^-->$/.test(nextStripped.trim())) break
          j++
        }
        continue
      }
      // v0.3 closing tag: `> <!-- /USER_MEMO -->`
      if (/^<!-- \/USER_MEMO\s*-->$/.test(stripped.trim())) {
        bqResult.push(stripped)
        continue
      }
    }
    bqResult.push(raw)
  }

  const lines = bqResult
  const result: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // v0.3 single-line memo (handles extended attrs like owner, source)
    // <!-- USER_MEMO id="abc" color="red" ... : feedback text -->
    // Also handles memos split across lines (trailing newline in text before -->)
    const v3Match = trimmed.match(/^<!-- USER_MEMO\s+id="([^"]+)"\s+(.*?)\s*:\s*(.*?)\s*-->$/)
    if (v3Match) {
      const id = v3Match[1]
      const attrStr = v3Match[2]
      const text = v3Match[3].replace(/--\u200B>/g, '-->')

      const colorMatch = attrStr.match(/color="([^"]+)"/)
      const statusMatch = attrStr.match(/status="([^"]+)"/)
      const color = normalizeMemoColor(colorMatch ? colorMatch[1] : 'red')
      const status = statusMatch ? statusMatch[1] : 'open'

      const encText = escAttr(text)
      result.push(`<div data-memo-block data-memo-id="${id}" data-memo-text="${encText}" data-memo-color="${color}" data-memo-status="${status}">memo: ${escHtml(text)}</div>`)
      i++
      continue
    }

    // v0.3 memo split across lines: <!-- USER_MEMO id="..." color="..." : text\n -->
    const v3SplitMatch = trimmed.match(/^<!-- USER_MEMO\s+id="([^"]+)"\s+(.*?)\s*:\s*(.*?)$/)
    if (v3SplitMatch && !trimmed.endsWith('-->')) {
      const id = v3SplitMatch[1]
      const attrStr = v3SplitMatch[2]
      let text = v3SplitMatch[3]
      // Consume subsequent lines until we find -->
      i++
      while (i < lines.length) {
        const nextTrimmed = lines[i].trim()
        if (nextTrimmed === '-->') { i++; break }
        if (nextTrimmed.endsWith('-->')) {
          text += ' ' + nextTrimmed.slice(0, -3).trim()
          i++
          break
        }
        text += ' ' + nextTrimmed
        i++
      }
      text = text.replace(/--\u200B>/g, '-->').trim()

      const colorMatch = attrStr.match(/color="([^"]+)"/)
      const statusMatch = attrStr.match(/status="([^"]+)"/)
      const color = normalizeMemoColor(colorMatch ? colorMatch[1] : 'red')
      const status = statusMatch ? statusMatch[1] : 'open'

      const encText = escAttr(text)
      result.push(`<div data-memo-block data-memo-id="${id}" data-memo-text="${encText}" data-memo-color="${color}" data-memo-status="${status}">memo: ${escHtml(text)}</div>`)
      continue
    }

    // v0.4 multi-line memo: <!-- USER_MEMO\n  key="val"\n  ...\n-->
    if (/^<!-- USER_MEMO\s*$/.test(trimmed)) {
      const attrLines: string[] = []
      i++
      while (i < lines.length && !/^-->$/.test(lines[i].trim())) {
        attrLines.push(lines[i])
        i++
      }
      i++ // skip -->

      const attrs: Record<string, string> = {}
      for (const al of attrLines) {
        const m = al.trim().match(/^(\w+)="([^"]*)"$/)
        if (m) attrs[m[1]] = m[2]
      }

      const id = attrs.id || ''
      const color = normalizeMemoColor(attrs.color || 'red')
      const status = attrs.status || 'open'
      const text = attrs.text || ''
      const anchorText = attrs.anchorText || ''

      const encText = escAttr(text)
      const encAnchor = escAttr(anchorText)
      result.push(`<div data-memo-block data-memo-id="${id}" data-memo-text="${encText}" data-memo-color="${color}" data-memo-status="${status}" data-memo-anchor="${encAnchor}">memo: ${escHtml(text)}</div>`)
      continue
    }

    // Skip <!-- /USER_MEMO --> closing tags
    if (/^<!-- \/USER_MEMO\s*-->$/.test(trimmed)) {
      i++
      continue
    }

    // Skip GATE blocks
    if (/^<!-- GATE\s*$/.test(trimmed)) {
      i++
      while (i < lines.length && !/^-->$/.test(lines[i].trim())) i++
      i++
      continue
    }

    // Skip PLAN_CURSOR blocks
    if (/^<!-- PLAN_CURSOR\s*$/.test(trimmed)) {
      i++
      while (i < lines.length && !/^-->$/.test(lines[i].trim())) i++
      i++
      continue
    }

    // Skip CHECKPOINT lines
    if (/^<!-- CHECKPOINT\s/.test(trimmed)) {
      i++
      continue
    }

    // Skip HIGHLIGHT_MARK comments (persisted highlights — handled separately)
    if (/^<!-- HIGHLIGHT_MARK\s/.test(trimmed)) {
      i++
      continue
    }

    // Skip banner comments
    if (/^<!--$/.test(trimmed) && i + 1 < lines.length && /MD Feedback/.test(lines[i + 1])) {
      while (i < lines.length && !lines[i].includes('-->')) i++
      i++
      continue
    }

    // Skip feedback notes wrappers
    if (/^<!-- \/?(USER_FEEDBACK_NOTES|@\/?feedback-notes)\b.*-->$/.test(trimmed)) {
      i++
      continue
    }

    // REVIEW_RESPONSE markers → container divs
    const respOpenMatch = trimmed.match(/^<!-- REVIEW_RESPONSE\s+to="([^"]+)"\s*-->$/)
    if (respOpenMatch) {
      result.push(`<div data-review-response data-response-to="${escAttr(respOpenMatch[1])}">`)
      i++
      continue
    }
    if (/^<!-- \/REVIEW_RESPONSE\s*-->$/.test(trimmed)) {
      result.push('</div>')
      i++
      continue
    }

    // Legacy memo blocks: <!-- @memo ... --> ... <!-- @/memo -->
    const legacyMatch = trimmed.match(/^<!-- @memo\s+id="([^"]+)"(?:\s+color="([^"]+)")?\s*-->$/)
    if (legacyMatch) {
      const memoContentLines: string[] = []
      i++
      while (i < lines.length && !/^<!-- @\/memo -->$/.test(lines[i].trim())) {
        memoContentLines.push(lines[i])
        i++
      }
      i++ // skip <!-- @/memo -->
      const text = memoContentLines.map(l => l.replace(/^<!--\s*/, '').replace(/\s*-->$/, '')).join('\n').trim()
      const id = legacyMatch[1]
      const color = normalizeMemoColor(legacyMatch[2] || 'red')
      const encText = escAttr(text)
      result.push(`<div data-memo-block data-memo-id="${id}" data-memo-text="${encText}" data-memo-color="${color}" data-memo-status="open">memo: ${escHtml(text)}</div>`)
      continue
    }

    result.push(line)
    i++
  }

  // Trim trailing empty lines
  while (result.length > 0 && result[result.length - 1].trim() === '') {
    result.pop()
  }

  return result.join('\n')
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function decAttr(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

const HIGHLIGHT_MARK_PATTERN = '<!-- HIGHLIGHT_MARK color="([^"]*)" text="([^"]*)" anchor="([^"]*)" -->'

/** Extract persisted highlight marks from markdown (HTML comment format) */
export function extractHighlightMarks(markdown: string): HighlightMark[] {
  const marks: HighlightMark[] = []
  const re = new RegExp(HIGHLIGHT_MARK_PATTERN, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(markdown)) !== null) {
    marks.push({
      color: match[1],
      text: decAttr(match[2]),
      anchor: decAttr(match[3]),
    })
  }
  return marks
}

/** Strip HIGHLIGHT_MARK comments from markdown */
export function stripHighlightMarks(markdown: string): string {
  return markdown.replace(/\n*<!-- HIGHLIGHT_MARK color="[^"]*" text="[^"]*" anchor="[^"]*" -->/g, '')
}

/** @deprecated Use `splitDocument(...).memos` (MemoV2) or `extractMemosV2`. */
export function extractMemos(annotatedMarkdown: string): { markdown: string; memos: Memo[] } {
  const memos: Memo[] = []
  const lines = annotatedMarkdown.split('\n')
  const cleanLines: string[] = []
  let inLegacyMemo = false
  let currentMemo: Partial<Memo> | null = null
  let memoContentLines: string[] = []
  let anchorLineContent: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.trim() === '<!--' && i + 1 < lines.length && lines[i + 1].includes('MD Feedback')) {
      while (i < lines.length && !lines[i].includes('-->')) i++
      continue
    }

    const newMatch = line.match(/<!-- USER_MEMO\s+id="([^"]+)"(?:\s+color="([^"]+)")?(?:\s+status="([^"]+)")?\s*:\s*(.*?)\s*-->/)
    if (newMatch) {
      let anchor: string | null = null
      for (let j = cleanLines.length - 1; j >= 0; j--) {
        if (cleanLines[j].trim()) { anchor = cleanLines[j].trim(); break }
      }
      memos.push({
        id: newMatch[1],
        text: newMatch[4].replace(/--\u200B>/g, '-->'),
        color: (newMatch[2] as Memo['color']) || 'red',
        anchorPos: null,
        anchorText: anchor,
        createdAt: new Date().toISOString().split('T')[0],
      })
      continue
    }

    // v0.4 multi-line memo: <!-- USER_MEMO\n  key="val"\n-->
    if (/^<!-- USER_MEMO\s*$/.test(line.trim())) {
      const attrLines: string[] = []
      i++
      while (i < lines.length && !/^-->$/.test(lines[i].trim())) {
        attrLines.push(lines[i])
        i++
      }
      // i now points at --> line, loop increment will skip it

      const attrs: Record<string, string> = {}
      for (const al of attrLines) {
        const am = al.trim().match(/^(\w+)="([^"]*)"$/)
        if (am) attrs[am[1]] = am[2]
      }

      let anchor: string | null = attrs.anchorText || null
      if (!anchor) {
        for (let j = cleanLines.length - 1; j >= 0; j--) {
          if (cleanLines[j].trim()) { anchor = cleanLines[j].trim(); break }
        }
      }

      memos.push({
        id: attrs.id || '',
        text: (attrs.text || '').replace(/--\u200B>/g, '-->'),
        color: (attrs.color as Memo['color']) || 'red',
        anchorPos: null,
        anchorText: anchor,
        createdAt: attrs.createdAt ? attrs.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
      })
      continue
    }

    const legacyStart = line.match(/<!-- @memo\s+id="([^"]+)"(?:\s+color="([^"]+)")?(?:\s+date="([^"]+)")?\s*-->/)
    if (legacyStart) {
      inLegacyMemo = true
      currentMemo = {
        id: legacyStart[1],
        color: (legacyStart[2] as Memo['color']) || 'red',
        createdAt: legacyStart[3] || new Date().toISOString().split('T')[0],
      }
      memoContentLines = []
      for (let j = cleanLines.length - 1; j >= 0; j--) {
        if (cleanLines[j].trim()) { anchorLineContent = cleanLines[j].trim(); break }
      }
      continue
    }

    if (line.match(/<!-- @\/memo -->/)) {
      if (currentMemo) {
        const text = memoContentLines.map(l => l.replace(/^<!--\s*/, '').replace(/\s*-->$/, '')).join('\n').trim()
        memos.push({
          id: currentMemo.id!,
          text,
          color: currentMemo.color as Memo['color'],
          anchorPos: null,
          anchorText: anchorLineContent,
          createdAt: currentMemo.createdAt!,
        })
      }
      inLegacyMemo = false
      currentMemo = null
      anchorLineContent = null
      continue
    }

    if (inLegacyMemo) { memoContentLines.push(line); continue }
    if (line.match(/<!-- \/?USER_FEEDBACK_NOTES\b.*-->/) || line.match(/<!-- @\/?feedback-notes -->/)) continue

    cleanLines.push(line)
  }

  while (cleanLines.length > 0 && cleanLines[cleanLines.length - 1].trim() === '') cleanLines.pop()
  return { markdown: cleanLines.join('\n'), memos }
}

export function normalizeHighlights(markdown: string): string {
  // Split by fenced code blocks to avoid matching ==text== inside them
  const parts = markdown.split(/(^```[\s\S]*?^```|^~~~[\s\S]*?^~~~)/gm)
  return parts.map((part, i) => {
    // Odd indices are code blocks — preserve as-is
    if (i % 2 === 1) return part
    // Even indices are normal content — normalize ==text== to <mark>
    return part.replace(/(?<!`)==(?!.*==.*`)(.+?)==(?!`)/g, '<mark>$1</mark>')
  }).join('')
}

/**
 * Extract memos as v0.4.0 MemoV2 with status/owner/source.
 * Handles both v0.3 single-line and v0.4 multi-line formats.
 * v0.3 memos auto-fill: status=open, owner=human, source=generic.
 */
export function extractMemosV2(annotatedMarkdown: string): { markdown: string; memos: MemoV2[] } {
  const parts = splitDocument(annotatedMarkdown)
  return { markdown: parts.body, memos: parts.memos }
}

/* ── Share to AI: compact review protocol for agent consumption ── */

/** @deprecated Use MemoV2-based export/context helpers instead of v0.3 floating memo summary. */
export function generateReviewSummary(
  title: string,
  highlights: ReviewHighlight[],
  docMemos: ReviewMemo[],
  floatingMemos: FloatingMemoInput[],
  filePath: string = '',
): string {
  const items = collectFeedbackItems(highlights, docMemos, { floatingMemos })
  const fp = filePath || '(file path not set)'
  const docTitle = title || 'Untitled'

  if (items.length === 0) {
    return `# REVIEW: ${docTitle}\n\n**File:** \`${fp}\`\n\nNo feedback.`
  }

  const fixes = items.filter(i => i.type === 'fix')
  const questions = items.filter(i => i.type === 'question')
  const importants = items.filter(i => i.type === 'important')

  const counts: string[] = []
  if (fixes.length) counts.push(`${fixes.length} fix`)
  if (questions.length) counts.push(`${questions.length} question`)
  if (importants.length) counts.push(`${importants.length} note`)

  const L: string[] = []

  L.push(`# REVIEW FEEDBACK — \`${fp}\``)
  L.push('')
  L.push(`**Document:** ${docTitle}`)
  L.push(`**Items:** ${counts.join(', ')} (${items.length} total)`)
  L.push('')

  if (fixes.length > 0) {
    L.push('## FIX (edit the source file)')
    L.push('')
    for (let i = 0; i < fixes.length; i++) {
      const f = fixes[i]
      const prefix = `${i + 1}.`
      const section = f.section ? `**${f.section}**` : '**General**'

      if (f.text) {
        L.push(`${prefix} ${section} — "${truncateText(f.text, 80)}"`)
      } else {
        L.push(`${prefix} ${section}`)
      }

      if (f.feedback) {
        L.push(`   ${f.feedback}`)
      }
      L.push('')
    }
  }

  if (questions.length > 0) {
    L.push('## QUESTION (investigate and clarify)')
    L.push('')
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const prefix = `${i + 1}.`
      const section = q.section ? `**${q.section}**` : '**General**'

      if (q.text) {
        L.push(`${prefix} ${section} — "${truncateText(q.text, 80)}"`)
      } else {
        L.push(`${prefix} ${section}`)
      }

      if (q.feedback) {
        L.push(`   ${q.feedback}`)
      }
      L.push('')
    }
  }

  if (importants.length > 0) {
    L.push('## IMPORTANT (context for your work)')
    L.push('')
    for (const imp of importants) {
      const section = imp.section ? `**${imp.section}**` : '**General**'
      if (imp.text) {
        L.push(`- ${section} — "${truncateText(imp.text, 80)}"`)
      }
      if (imp.feedback) {
        L.push(`- ${section} — ${imp.feedback}`)
      }
    }
    L.push('')
  }

  return L.join('\n').trimEnd()
}

// ─── Checkpoint roundtrip ───

const CHECKPOINT_PATTERN = '<!-- CHECKPOINT id="([^"]+)" time="([^"]+)" note="([^"]*)" fixes=(\\d+) questions=(\\d+) highlights=(\\d+) sections="([^"]*)" -->'

export function extractCheckpoints(markdown: string): Checkpoint[] {
  const checkpoints: Checkpoint[] = []
  const re = new RegExp(CHECKPOINT_PATTERN, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(markdown)) !== null) {
    checkpoints.push({
      id: match[1],
      timestamp: match[2],
      note: match[3],
      fixes: parseInt(match[4], 10),
      questions: parseInt(match[5], 10),
      highlights: parseInt(match[6], 10),
      sectionsReviewed: match[7] ? match[7].split(',') : [],
    })
  }
  return checkpoints
}

export function serializeCheckpoint(cp: Checkpoint): string {
  const note = cp.note.replace(/"/g, '&quot;')
  const sections = cp.sectionsReviewed.join(',')
  return `<!-- CHECKPOINT id="${cp.id}" time="${cp.timestamp}" note="${note}" fixes=${cp.fixes} questions=${cp.questions} highlights=${cp.highlights} sections="${sections}" -->`
}
