/**
 * Document Writer — Split/Merge pipeline for annotated markdown
 *
 * splitDocument(): parse annotated markdown into structured DocumentParts
 * mergeDocument(): reassemble DocumentParts back into markdown
 *
 * Preserves: frontmatter, memos (v0.3 + v0.4), checkpoints, gates, cursor
 */

import type { DocumentParts, MemoV2, Gate, PlanCursor, Checkpoint, MemoColor, ReviewResponse, MemoImpl, MemoArtifact, MemoDependency, ImplOperation } from './types'
import { colorToType, isResolved, HEX_TO_COLOR_NAME } from './types'
import { generateId } from './id'
import { parseJsonStrict } from './errors'

// ─── Attribute escape/unescape (unified, handles &, ", newline, -->) ───

export function escAttrValue(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/-->/g, '--&#62;')
}
export function unescAttrValue(s: string): string {
  return s.replace(/--&#62;/g, '-->').replace(/&#10;/g, '\n').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

// ─── Hash utility (simple djb2, no crypto needed) ───

export function computeLineHash(line: string): string {
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

// REVIEW_RESPONSE markers (open/close tags)
const RESPONSE_OPEN_RE = /^<!-- REVIEW_RESPONSE\s+to="([^"]+)"\s*-->$/
const RESPONSE_CLOSE_RE = /^<!-- \/REVIEW_RESPONSE\s*-->$/

// MEMO_IMPL: <!-- MEMO_IMPL\n  id="..." memoId="..." ... \n-->
const IMPL_START_RE = /^<!-- MEMO_IMPL\s*$/
const IMPL_END_RE = /^-->$/

// MEMO_ARTIFACT: <!-- MEMO_ARTIFACT\n  id="..." memoId="..." ... \n-->
const ARTIFACT_START_RE = /^<!-- MEMO_ARTIFACT\s*$/
const ARTIFACT_END_RE = /^-->$/

// MEMO_DEPENDENCY: <!-- MEMO_DEPENDENCY id="..." from="..." to="..." type="..." -->
const DEPENDENCY_RE = /^<!-- MEMO_DEPENDENCY\s+id="([^"]+)"\s+from="([^"]+)"\s+to="([^"]+)"\s+type="([^"]+)" -->$/
const HIGHLIGHT_MARK_RE = /<!-- HIGHLIGHT_MARK color="([^"]*)" text="([^"]*)" anchor="([^"]*)" -->/g
const ANCHOR_HASH_SEARCH_RADIUS = 10

/** Parse attribute key="value" pairs from multi-line comment body */
function parseAttrs(lines: string[]): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const line of lines) {
    const m = line.trim().match(/^(\w+)="([^"]*)"$/)
    if (m) attrs[m[1]] = unescAttrValue(m[2])
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
  const responses: ReviewResponse[] = []
  const impls: MemoImpl[] = []
  const artifacts: MemoArtifact[] = []
  const dependencies: MemoDependency[] = []
  const checkpoints: Checkpoint[] = []
  const gates: Gate[] = []
  let cursor: PlanCursor | null = null
  let openResponse: ReviewResponse | null = null

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // ── REVIEW_RESPONSE markers ──
    const respOpenMatch = trimmed.match(RESPONSE_OPEN_RE)
    if (respOpenMatch) {
      openResponse = {
        id: `resp_${respOpenMatch[1]}`,
        to: respOpenMatch[1],
        bodyStartIdx: bodyLines.length,
        bodyEndIdx: -1,
      }
      i++
      continue
    }
    if (RESPONSE_CLOSE_RE.test(trimmed)) {
      if (openResponse) {
        openResponse.bodyEndIdx = bodyLines.length - 1
        responses.push(openResponse)
        openResponse = null
      }
      i++
      continue
    }

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
        anchor: anchorLine >= 0 ? `L${anchorLine + 1}|${computeLineHash(bodyLines[anchorLine] || '')}` : '',
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
      // Refresh anchor using persisted anchor/hash/anchorText (not last seen body line).
      // This avoids collapsing all EOF metadata memos onto the same trailing body line.
      const anchorLineIdx = findMemoAnchorLine(bodyLines, {
        id: a.id || 'memo_parse_tmp',
        type: (a.type as MemoV2['type']) || 'fix',
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
      const freshAnchor = anchorLineIdx >= 0
        ? `L${anchorLineIdx + 1}|${computeLineHash(bodyLines[anchorLineIdx] || '')}`
        : (a.anchor || '')
      memos.push({
        id: a.id || generateId('memo'),
        type: (a.type as MemoV2['type']) || colorToType((a.color || 'red') as MemoColor),
        status: (a.status as MemoV2['status']) || 'open',
        owner: (a.owner as MemoV2['owner']) || 'human',
        source: a.source || 'generic',
        color: (a.color || 'red') as MemoColor,
        text: a.text || '',
        anchorText,
        anchor: freshAnchor,
        createdAt: a.createdAt || new Date().toISOString(),
        updatedAt: a.updatedAt || new Date().toISOString(),
        ...(a.rejectReason ? { rejectReason: a.rejectReason } : {}),
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
      const override = a.override as Gate['override'] | undefined
      gates.push({
        id: a.id || generateId('gate'),
        type: (a.type as Gate['type']) || 'custom',
        status: (a.status as Gate['status']) || 'blocked',
        blockedBy: a.blockedBy ? a.blockedBy.split(',').map(s => s.trim()).filter(Boolean) : [],
        canProceedIf: a.canProceedIf || '',
        doneDefinition: a.doneDefinition || '',
        ...(override ? { override } : {}),
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

    // ── MEMO_IMPL ──
    if (IMPL_START_RE.test(trimmed)) {
      const attrLines: string[] = []
      i++
      while (i < lines.length && !IMPL_END_RE.test(lines[i].trim())) {
        attrLines.push(lines[i])
        i++
      }
      i++ // skip -->
      const a = parseAttrs(attrLines)
      let operations: ImplOperation[] = []
      try { operations = parseJsonStrict<ImplOperation[]>(a.operations || '[]', 'MEMO_IMPL.operations') } catch { /* best effort */ }
      impls.push({
        id: a.id || generateId('impl', { separator: '_' }),
        memoId: a.memoId || '',
        status: (a.status as MemoImpl['status']) || 'applied',
        operations,
        summary: a.summary || '',
        appliedAt: a.appliedAt || new Date().toISOString(),
      })
      continue
    }

    // ── MEMO_ARTIFACT ──
    if (ARTIFACT_START_RE.test(trimmed)) {
      const attrLines: string[] = []
      i++
      while (i < lines.length && !ARTIFACT_END_RE.test(lines[i].trim())) {
        attrLines.push(lines[i])
        i++
      }
      i++ // skip -->
      const a = parseAttrs(attrLines)
      artifacts.push({
        id: a.id || generateId('art', { separator: '_' }),
        memoId: a.memoId || '',
        files: a.files ? a.files.split(',').map(s => s.trim()).filter(Boolean) : [],
        linkedAt: a.linkedAt || new Date().toISOString(),
      })
      continue
    }

    // ── MEMO_DEPENDENCY ──
    const depMatch = trimmed.match(DEPENDENCY_RE)
    if (depMatch) {
      dependencies.push({
        id: depMatch[1],
        from: depMatch[2],
        to: depMatch[3],
        type: depMatch[4] as MemoDependency['type'],
      })
      i++
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
        anchor: anchorLine >= 0 ? `L${anchorLine + 1}|${computeLineHash(bodyLines[anchorLine] || '')}` : '',
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

  // Handle unclosed response
  if (openResponse) {
    openResponse.bodyEndIdx = bodyLines.length - 1
    responses.push(openResponse)
  }

  // Auto-escalate: memos with a REVIEW_RESPONSE and status "open" → "needs_review"
  // (Requires human approval via VS Code CodeLens to reach terminal status)
  const respondedMemoIds = new Set(responses.map(r => r.to))
  for (const memo of memos) {
    if (memo.status === 'open' && respondedMemoIds.has(memo.id)) {
      memo.status = 'needs_review'
    }
  }

  // Recover missing fix/question memos from persisted highlight marks.
  // If memo blocks are accidentally missing, MCP agents would otherwise see no actionable memos.
  // Normalize dedup keys: strip leading markdown heading markers (### ) so
  // "### Step 3: foo" and "Step 3: foo" match as the same anchor.
  const stripHeadingPrefix = (s: string) => s.replace(/^#+\s*/, '').trim()
  const existingMemoKeys = new Set(
    memos
      .filter(m => m.color === 'red' || m.color === 'blue')
      .map(m => `${m.color}|${stripHeadingPrefix(m.anchorText)}`),
  )
  HIGHLIGHT_MARK_RE.lastIndex = 0
  let markMatch: RegExpExecArray | null
  while ((markMatch = HIGHLIGHT_MARK_RE.exec(body)) !== null) {
    const memoColor = normalizeMemoColorFromHighlight(markMatch[1])
    if (memoColor !== 'red' && memoColor !== 'blue') continue

    const markText = decodeHighlightAttr(markMatch[2]).trim()
    const markAnchor = decodeHighlightAttr(markMatch[3]).trim()
    const anchorText = markAnchor || markText
    if (!anchorText) continue

    const dedupeKey = `${memoColor}|${stripHeadingPrefix(anchorText)}`
    if (existingMemoKeys.has(dedupeKey)) continue

    const searchNeedle = anchorText.slice(0, 40)
    const anchorLineIdx = searchNeedle ? bodyLines.findIndex(l => l.includes(searchNeedle)) : -1
    const anchor = anchorLineIdx >= 0
      ? `L${anchorLineIdx + 1}|${computeLineHash(bodyLines[anchorLineIdx] || '')}`
      : ''
    const now = new Date().toISOString()

    const recoveredId = `memo_recovered_${computeLineHash(`${memoColor}|${anchorText}|${markText}`)}`
    memos.push({
      id: recoveredId,
      type: colorToType(memoColor),
      status: 'open',
      owner: 'human',
      source: 'recovered-highlight',
      color: memoColor,
      text: markText,
      anchorText,
      anchor,
      createdAt: now,
      updatedAt: now,
    })
    existingMemoKeys.add(dedupeKey)
  }

  return {
    frontmatter,
    body: bodyLines.join('\n'),
    memos,
    responses,
    impls,
    artifacts,
    dependencies,
    checkpoints,
    gates,
    cursor,
  }
}

// ─── mergeDocument ───

export function mergeDocument(parts: DocumentParts): string {
  const sections: string[] = []

  // Frontmatter
  if (parts.frontmatter) {
    sections.push(parts.frontmatter.trimEnd())
  }

  // Body with memos and response markers re-inserted at anchor positions
  const bodyWithMemos = reinsertMemosAndResponses(parts.body, parts.memos, parts.responses || [])
  sections.push(bodyWithMemos)

  // Implementation records
  for (const impl of (parts.impls || [])) {
    sections.push(serializeMemoImpl(impl))
  }

  // Artifacts
  for (const art of (parts.artifacts || [])) {
    sections.push(serializeMemoArtifact(art))
  }

  // Dependencies
  for (const dep of (parts.dependencies || [])) {
    sections.push(serializeMemoDependency(dep))
  }

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
  const lines = [
    '<!-- USER_MEMO',
    `  id="${escAttrValue(memo.id)}"`,
    `  type="${memo.type}"`,
    `  status="${memo.status}"`,
    `  owner="${memo.owner}"`,
    `  source="${escAttrValue(memo.source)}"`,
    `  color="${memo.color}"`,
    `  text="${escAttrValue(memo.text)}"`,
    `  anchorText="${escAttrValue(memo.anchorText)}"`,
    `  anchor="${escAttrValue(memo.anchor)}"`,
    `  createdAt="${memo.createdAt}"`,
    `  updatedAt="${memo.updatedAt}"`,
  ]
  if (memo.rejectReason) {
    lines.push(`  rejectReason="${escAttrValue(memo.rejectReason)}"`)
  }
  lines.push('-->')
  return lines.join('\n')
}

export function serializeGate(gate: Gate): string {
  const lines = [
    '<!-- GATE',
    `  id="${gate.id}"`,
    `  type="${gate.type}"`,
    `  status="${gate.status}"`,
    `  blockedBy="${gate.blockedBy.join(',')}"`,
    `  canProceedIf="${escAttrValue(gate.canProceedIf)}"`,
    `  doneDefinition="${escAttrValue(gate.doneDefinition)}"`,
  ]
  if (gate.override) {
    lines.push(`  override="${gate.override}"`)
  }
  lines.push('-->')
  return lines.join('\n')
}

export function serializeCursor(cursor: PlanCursor): string {
  return [
    '<!-- PLAN_CURSOR',
    `  taskId="${cursor.taskId}"`,
    `  step="${cursor.step}"`,
    `  nextAction="${escAttrValue(cursor.nextAction)}"`,
    `  lastSeenHash="${cursor.lastSeenHash}"`,
    `  updatedAt="${cursor.updatedAt}"`,
    '-->',
  ].join('\n')
}

export function serializeCheckpoint(cp: Checkpoint): string {
  const sections = cp.sectionsReviewed.join(',')
  return `<!-- CHECKPOINT id="${cp.id}" time="${cp.timestamp}" note="${escAttrValue(cp.note)}" fixes=${cp.fixes} questions=${cp.questions} highlights=${cp.highlights} sections="${sections}" -->`
}

export function serializeMemoImpl(impl: MemoImpl): string {
  return [
    '<!-- MEMO_IMPL',
    `  id="${escAttrValue(impl.id)}"`,
    `  memoId="${escAttrValue(impl.memoId)}"`,
    `  status="${impl.status}"`,
    `  operations="${escAttrValue(JSON.stringify(impl.operations))}"`,
    `  summary="${escAttrValue(impl.summary)}"`,
    `  appliedAt="${impl.appliedAt}"`,
    '-->',
  ].join('\n')
}

export function serializeMemoArtifact(art: MemoArtifact): string {
  return [
    '<!-- MEMO_ARTIFACT',
    `  id="${escAttrValue(art.id)}"`,
    `  memoId="${escAttrValue(art.memoId)}"`,
    `  files="${art.files.join(',')}"`,
    `  linkedAt="${art.linkedAt}"`,
    '-->',
  ].join('\n')
}

export function serializeMemoDependency(dep: MemoDependency): string {
  return `<!-- MEMO_DEPENDENCY id="${dep.id}" from="${dep.from}" to="${dep.to}" type="${dep.type}" -->`
}

// ─── Anchor-based memo reinsertion ───

function reinsertMemosAndResponses(body: string, memos: MemoV2[], responses: ReviewResponse[]): string {
  if (memos.length === 0 && responses.length === 0) return body

  const lines = body.split('\n')

  // Build memo insertion map: lineIndex -> memos to insert after that line
  const memoMap = new Map<number, MemoV2[]>()
  const unanchored: MemoV2[] = []

  for (const memo of memos) {
    const lineIdx = findMemoAnchorLine(lines, memo)
    if (lineIdx >= 0) {
      // Update anchor to actual position — prevents drift on repeated save cycles
      memo.anchor = `L${lineIdx + 1}|${computeLineHash(lines[lineIdx])}`
      const existing = memoMap.get(lineIdx) || []
      existing.push(memo)
      memoMap.set(lineIdx, existing)
    } else {
      unanchored.push(memo)
    }
  }

  // Build response marker maps
  const responseOpenAt = new Map<number, string>()
  const responseCloseAfter = new Map<number, string>()
  for (const resp of responses) {
    responseOpenAt.set(resp.bodyStartIdx, `<!-- REVIEW_RESPONSE to="${resp.to}" -->`)
    if (resp.bodyEndIdx >= 0) {
      responseCloseAfter.set(resp.bodyEndIdx, '<!-- /REVIEW_RESPONSE -->')
    }
  }

  // Single pass: interleave body lines, memos, and response markers
  const result: string[] = []
  for (let i = 0; i < lines.length; i++) {
    // Response opening marker before this line
    if (responseOpenAt.has(i)) result.push(responseOpenAt.get(i)!)

    result.push(lines[i])

    // Memos anchored to this line
    const memosHere = memoMap.get(i)
    if (memosHere) {
      for (const m of memosHere) {
        result.push(serializeMemoV2(m))
      }
    }

    // Response closing marker after this line (and its memos)
    if (responseCloseAfter.has(i)) result.push(responseCloseAfter.get(i)!)
  }

  // Append unanchored memos at the end
  for (const m of unanchored) {
    result.push(serializeMemoV2(m))
  }

  return result.join('\n')
}

/** Find the best line index for a memo based on its anchor */
export function findMemoAnchorLine(lines: string[], memo: MemoV2): number {
  // Try anchor hash first: "L42|a3f8c2d1" or "L42:L45|a3f8c2d1"
  if (memo.anchor) {
    const anchorMatch = memo.anchor.match(/^L(\d+)(?::L\d+)?\|(.+)$/)
    if (anchorMatch) {
      const lineNum = parseInt(anchorMatch[1], 10) - 1 // 0-indexed
      const expectedHash = anchorMatch[2]

      // Exact line match
      if (lineNum >= 0 && lineNum < lines.length && computeLineHash(lines[lineNum]) === expectedHash) {
        return lineNum
      }

      // Search nearby for hash match to tolerate local edits around anchors
      for (let delta = 1; delta <= ANCHOR_HASH_SEARCH_RADIUS; delta++) {
        for (const d of [lineNum - delta, lineNum + delta]) {
          if (d >= 0 && d < lines.length && computeLineHash(lines[d]) === expectedHash) {
            return d
          }
        }
      }
    }
  }

  // Fallback: search by anchorText content match
  if (memo.anchorText) {
    const needle = memo.anchorText.trim()
    const matches: number[] = []
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(needle)) matches.push(i)
    }
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) {
      // If line number is available, keep the closest matching occurrence.
      const lineMatch = memo.anchor.match(/^L(\d+)/)
      if (lineMatch) {
        const lineNum = parseInt(lineMatch[1], 10) - 1
        let best = matches[0]
        let bestDist = Math.abs(matches[0] - lineNum)
        for (const idx of matches.slice(1)) {
          const dist = Math.abs(idx - lineNum)
          if (dist < bestDist) {
            best = idx
            bestDist = dist
          }
        }
        return best
      }
      return matches[0]
    }
  }

  // Last resort: line-number-only fallback (clamped to valid range)
  // Prevents memos from being pushed to end-of-file when hash/text are stale
  if (memo.anchor) {
    const lineMatch = memo.anchor.match(/^L(\d+)/)
    if (lineMatch) {
      const lineNum = parseInt(lineMatch[1], 10) - 1
      return Math.max(0, Math.min(lineNum, lines.length - 1))
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
  return computeLineHash(body)
}

function decodeHighlightAttr(s: string): string {
  return unescAttrValue(s)
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function normalizeMemoColorFromHighlight(rawColor: string): MemoColor | null {
  const c = rawColor.toLowerCase()
  if (c === 'red' || c === 'blue' || c === 'yellow') return c
  const normalized = HEX_TO_COLOR_NAME[c]
  if (normalized === 'red' || normalized === 'blue' || normalized === 'yellow') return normalized
  return null
}
