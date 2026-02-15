/**
 * Document Writer — Split/Merge pipeline for annotated markdown
 *
 * splitDocument(): parse annotated markdown into structured DocumentParts
 * mergeDocument(): reassemble DocumentParts back into markdown
 *
 * Preserves: frontmatter, memos (v0.3 + v0.4), checkpoints, gates, cursor, unknown comments
 */

import type { DocumentParts, MemoV2, Gate, PlanCursor, Checkpoint, MemoColor } from './types'
import { colorToType } from './types'

// ─── Hash utility (simple djb2, no crypto needed) ───

function hashLine(line: string): string {
  let hash = 5381
  for (let i = 0; i < line.length; i++) {
    hash = ((hash << 5) + hash + line.charCodeAt(i)) >>> 0
  }
  return hash.toString(16).padStart(8, '0').slice(0, 8)
}

// ─── Regex patterns ───

// v0.3 single-line: <!-- USER_MEMO id="abc" color="red" status="done" : text -->
const MEMO_V3_RE = /^<!-- USER_MEMO\s+id="([^"]+)"(?:\s+color="([^"]+)")?(?:\s+status="([^"]+)")?\s*:\s*(.*?)\s*-->$/

// v0.4 multi-line: <!-- USER_MEMO\n  id="abc"\n  type="fix"\n  ...  \n-->
const MEMO_V4_START_RE = /^<!-- USER_MEMO\s*$/
const MEMO_V4_END_RE = /^-->$/

// Gate: <!-- GATE\n  id="gate-1"\n  ...  \n-->
const GATE_START_RE = /^<!-- GATE\s*$/
const GATE_END_RE = /^-->$/

// Cursor: <!-- PLAN_CURSOR\n  ...  \n-->
const CURSOR_START_RE = /^<!-- PLAN_CURSOR\s*$/
const CURSOR_END_RE = /^-->$/

// Checkpoint: <!-- CHECKPOINT id="..." ... -->
const CHECKPOINT_RE = /^<!-- CHECKPOINT\s+id="([^"]+)"\s+time="([^"]+)"\s+note="([^"]*)"\s+fixes=(\d+)\s+questions=(\d+)\s+highlights=(\d+)\s+sections="([^"]*)" -->$/

// Frontmatter: --- ... ---
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n/

// Legacy memo blocks
const LEGACY_MEMO_START_RE = /^<!-- @memo\s+id="([^"]+)"(?:\s+color="([^"]+)")?(?:\s+date="([^"]+)")?\s*-->$/
const LEGACY_MEMO_END_RE = /^<!-- @\/memo -->$/

// MD Feedback banner comment
const BANNER_START_RE = /^<!--$/
const BANNER_CONTENT_RE = /MD Feedback/

// Feedback notes wrapper
const FEEDBACK_NOTES_RE = /^<!-- \/?(USER_FEEDBACK_NOTES|@\/?feedback-notes)\b.*-->$/

/** Parse attribute key="value" pairs from multi-line comment body */
function parseAttrs(lines: string[]): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const line of lines) {
    const m = line.trim().match(/^(\w+)="([^"]*)"$/)
    if (m) attrs[m[1]] = m[2]
  }
  return attrs
}

// ─── splitDocument ───

export function splitDocument(markdown: string): DocumentParts {
  let frontmatter = ''
  let body = markdown

  // Extract frontmatter
  const fmMatch = body.match(FRONTMATTER_RE)
  if (fmMatch) {
    frontmatter = fmMatch[0]
    body = body.slice(fmMatch[0].length)
  }

  const lines = body.split('\n')
  const bodyLines: string[] = []
  const memos: MemoV2[] = []
  const checkpoints: Checkpoint[] = []
  const gates: Gate[] = []
  const unknownComments: string[] = []
  let cursor: PlanCursor | null = null

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // ── v0.3 single-line memo ──
    const v3Match = trimmed.match(MEMO_V3_RE)
    if (v3Match) {
      const anchorText = findAnchorAbove(bodyLines)
      const anchorLine = findAnchorLineIdx(bodyLines)
      const memoColor = (v3Match[2] || 'red') as MemoColor
      const memoStatus = (v3Match[3] as MemoV2['status']) || 'open'
      memos.push({
        id: v3Match[1],
        type: colorToType(memoColor),
        status: memoStatus,
        owner: 'human',
        source: 'generic',
        color: memoColor,
        text: v3Match[4].replace(/--\u200B>/g, '-->'),
        anchorText: anchorText || '',
        anchor: anchorLine >= 0 ? `L${anchorLine + 1}|${hashLine(bodyLines[anchorLine] || '')}` : '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      i++
      continue
    }

    // ── v0.4 multi-line memo ──
    if (MEMO_V4_START_RE.test(trimmed)) {
      const attrLines: string[] = []
      i++
      while (i < lines.length && !MEMO_V4_END_RE.test(lines[i].trim())) {
        attrLines.push(lines[i])
        i++
      }
      i++ // skip -->
      const a = parseAttrs(attrLines)
      const anchorText = a.anchorText || findAnchorAbove(bodyLines) || ''
      memos.push({
        id: a.id || `memo_${Date.now()}`,
        type: (a.type as MemoV2['type']) || colorToType((a.color || 'red') as MemoColor),
        status: (a.status as MemoV2['status']) || 'open',
        owner: (a.owner as MemoV2['owner']) || 'human',
        source: a.source || 'generic',
        color: (a.color || 'red') as MemoColor,
        text: a.text || '',
        anchorText,
        anchor: a.anchor || '',
        createdAt: a.createdAt || new Date().toISOString(),
        updatedAt: a.updatedAt || new Date().toISOString(),
      })
      continue
    }

    // ── Gate ──
    if (GATE_START_RE.test(trimmed)) {
      const attrLines: string[] = []
      i++
      while (i < lines.length && !GATE_END_RE.test(lines[i].trim())) {
        attrLines.push(lines[i])
        i++
      }
      i++ // skip -->
      const a = parseAttrs(attrLines)
      gates.push({
        id: a.id || `gate_${Date.now()}`,
        type: (a.type as Gate['type']) || 'custom',
        status: (a.status as Gate['status']) || 'blocked',
        blockedBy: a.blockedBy ? a.blockedBy.split(',').map(s => s.trim()).filter(Boolean) : [],
        canProceedIf: a.canProceedIf || '',
        doneDefinition: a.doneDefinition || '',
      })
      continue
    }

    // ── Plan Cursor ──
    if (CURSOR_START_RE.test(trimmed)) {
      const attrLines: string[] = []
      i++
      while (i < lines.length && !CURSOR_END_RE.test(lines[i].trim())) {
        attrLines.push(lines[i])
        i++
      }
      i++ // skip -->
      const a = parseAttrs(attrLines)
      cursor = {
        taskId: a.taskId || '',
        step: a.step || '',
        nextAction: a.nextAction || '',
        lastSeenHash: a.lastSeenHash || '',
        updatedAt: a.updatedAt || new Date().toISOString(),
      }
      continue
    }

    // ── Checkpoint ──
    const cpMatch = trimmed.match(CHECKPOINT_RE)
    if (cpMatch) {
      checkpoints.push({
        id: cpMatch[1],
        timestamp: cpMatch[2],
        note: cpMatch[3],
        fixes: parseInt(cpMatch[4], 10),
        questions: parseInt(cpMatch[5], 10),
        highlights: parseInt(cpMatch[6], 10),
        sectionsReviewed: cpMatch[7] ? cpMatch[7].split(',') : [],
      })
      i++
      continue
    }

    // ── Legacy memo blocks ──
    const legacyMatch = trimmed.match(LEGACY_MEMO_START_RE)
    if (legacyMatch) {
      const memoLines: string[] = []
      const anchorText = findAnchorAbove(bodyLines)
      const anchorLine = findAnchorLineIdx(bodyLines)
      i++
      while (i < lines.length && !LEGACY_MEMO_END_RE.test(lines[i].trim())) {
        memoLines.push(lines[i])
        i++
      }
      i++ // skip <!-- @/memo -->
      const text = memoLines
        .map(l => l.replace(/^<!--\s*/, '').replace(/\s*-->$/, ''))
        .join('\n').trim()
      memos.push({
        id: legacyMatch[1],
        type: colorToType((legacyMatch[2] || 'red') as MemoColor),
        status: 'open',
        owner: 'human',
        source: 'generic',
        color: (legacyMatch[2] || 'red') as MemoColor,
        text,
        anchorText: anchorText || '',
        anchor: anchorLine >= 0 ? `L${anchorLine + 1}|${hashLine(bodyLines[anchorLine] || '')}` : '',
        createdAt: legacyMatch[3] || new Date().toISOString(),
        updatedAt: legacyMatch[3] || new Date().toISOString(),
      })
      continue
    }

    // ── Banner comment (MD Feedback header) ──
    if (BANNER_START_RE.test(trimmed) && i + 1 < lines.length && BANNER_CONTENT_RE.test(lines[i + 1])) {
      while (i < lines.length && !lines[i].includes('-->')) i++
      i++
      continue
    }

    // ── Feedback notes wrapper ──
    if (FEEDBACK_NOTES_RE.test(trimmed)) {
      i++
      continue
    }

    bodyLines.push(line)
    i++
  }

  // Trim trailing empty lines from body
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') {
    bodyLines.pop()
  }

  return {
    frontmatter,
    body: bodyLines.join('\n'),
    memos,
    checkpoints,
    gates,
    cursor,
    unknownComments,
  }
}

// ─── mergeDocument ───

export function mergeDocument(parts: DocumentParts): string {
  const sections: string[] = []

  // Frontmatter
  if (parts.frontmatter) {
    sections.push(parts.frontmatter.trimEnd())
  }

  // Body with memos re-inserted at anchor positions
  const bodyWithMemos = reinsertMemos(parts.body, parts.memos)
  sections.push(bodyWithMemos)

  // Gates
  for (const gate of parts.gates) {
    sections.push(serializeGate(gate))
  }

  // Checkpoints
  for (const cp of parts.checkpoints) {
    sections.push(serializeCheckpoint(cp))
  }

  // Plan cursor (always at end)
  if (parts.cursor) {
    sections.push(serializeCursor(parts.cursor))
  }

  return sections.join('\n\n') + '\n'
}

// ─── Serializers ───

export function serializeMemoV2(memo: MemoV2): string {
  const esc = (s: string) => s.replace(/"/g, '&quot;')
  return [
    '<!-- USER_MEMO',
    `  id="${esc(memo.id)}"`,
    `  type="${memo.type}"`,
    `  status="${memo.status}"`,
    `  owner="${memo.owner}"`,
    `  source="${esc(memo.source)}"`,
    `  color="${memo.color}"`,
    `  text="${esc(memo.text)}"`,
    `  anchorText="${esc(memo.anchorText)}"`,
    `  anchor="${esc(memo.anchor)}"`,
    `  createdAt="${memo.createdAt}"`,
    `  updatedAt="${memo.updatedAt}"`,
    '-->',
  ].join('\n')
}

export function serializeGate(gate: Gate): string {
  return [
    '<!-- GATE',
    `  id="${gate.id}"`,
    `  type="${gate.type}"`,
    `  status="${gate.status}"`,
    `  blockedBy="${gate.blockedBy.join(',')}"`,
    `  canProceedIf="${gate.canProceedIf.replace(/"/g, '&quot;')}"`,
    `  doneDefinition="${gate.doneDefinition.replace(/"/g, '&quot;')}"`,
    '-->',
  ].join('\n')
}

export function serializeCursor(cursor: PlanCursor): string {
  return [
    '<!-- PLAN_CURSOR',
    `  taskId="${cursor.taskId}"`,
    `  step="${cursor.step}"`,
    `  nextAction="${cursor.nextAction.replace(/"/g, '&quot;')}"`,
    `  lastSeenHash="${cursor.lastSeenHash}"`,
    `  updatedAt="${cursor.updatedAt}"`,
    '-->',
  ].join('\n')
}

export function serializeCheckpoint(cp: Checkpoint): string {
  const note = cp.note.replace(/"/g, '&quot;')
  const sections = cp.sectionsReviewed.join(',')
  return `<!-- CHECKPOINT id="${cp.id}" time="${cp.timestamp}" note="${note}" fixes=${cp.fixes} questions=${cp.questions} highlights=${cp.highlights} sections="${sections}" -->`
}

// ─── Anchor-based memo reinsertion ───

function reinsertMemos(body: string, memos: MemoV2[]): string {
  if (memos.length === 0) return body

  const lines = body.split('\n')

  // Build insertion map: lineIndex -> memos to insert after that line
  const insertionMap = new Map<number, MemoV2[]>()
  const unanchored: MemoV2[] = []

  for (const memo of memos) {
    const lineIdx = findMemoAnchorLine(lines, memo)
    if (lineIdx >= 0) {
      const existing = insertionMap.get(lineIdx) || []
      existing.push(memo)
      insertionMap.set(lineIdx, existing)
    } else {
      unanchored.push(memo)
    }
  }

  // Build output with memos inserted after their anchor lines
  const result: string[] = []
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i])
    const memosHere = insertionMap.get(i)
    if (memosHere) {
      for (const m of memosHere) {
        result.push(serializeMemoV2(m))
      }
    }
  }

  // Append unanchored memos at the end
  for (const m of unanchored) {
    result.push(serializeMemoV2(m))
  }

  return result.join('\n')
}

/** Find the best line index for a memo based on its anchor */
function findMemoAnchorLine(lines: string[], memo: MemoV2): number {
  // Try anchor hash first: "L42|a3f8c2d1" or "L42:L45|a3f8c2d1"
  if (memo.anchor) {
    const anchorMatch = memo.anchor.match(/^L(\d+)(?::L\d+)?\|(.+)$/)
    if (anchorMatch) {
      const lineNum = parseInt(anchorMatch[1], 10) - 1 // 0-indexed
      const expectedHash = anchorMatch[2]

      // Exact line match
      if (lineNum >= 0 && lineNum < lines.length && hashLine(lines[lineNum]) === expectedHash) {
        return lineNum
      }

      // Search nearby (within 10 lines) for the hash
      for (let delta = 1; delta <= 10; delta++) {
        for (const d of [lineNum - delta, lineNum + delta]) {
          if (d >= 0 && d < lines.length && hashLine(lines[d]) === expectedHash) {
            return d
          }
        }
      }
    }
  }

  // Fallback: search by anchorText content match
  if (memo.anchorText) {
    const needle = memo.anchorText.trim()
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(needle)) return i
    }
  }

  return -1
}

// ─── Helper utilities ───

/** Find the nearest non-empty line content above bodyLines */
function findAnchorAbove(bodyLines: string[]): string | null {
  for (let j = bodyLines.length - 1; j >= 0; j--) {
    if (bodyLines[j].trim()) return bodyLines[j].trim()
  }
  return null
}

/** Find the nearest non-empty line index above bodyLines */
function findAnchorLineIdx(bodyLines: string[]): number {
  for (let j = bodyLines.length - 1; j >= 0; j--) {
    if (bodyLines[j].trim()) return j
  }
  return -1
}

/** Generate body hash (djb2, 8 hex chars) for Plan Cursor */
export function generateBodyHash(body: string): string {
  return hashLine(body)
}
