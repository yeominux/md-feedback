export interface Memo {
  id: string
  text: string
  color: MemoColor
  anchorPos: number | null
  anchorText: string | null
  createdAt: string
}

export interface ReviewHighlight {
  text: string
  color: string
  section: string
  context: string
}

export interface ReviewMemo {
  id: string
  text: string
  color: string
  section: string
  context: string
}

/**
 * Annotation types:
 *   yellow = highlight (personal reading mark, not sent to AI)
 *   red    = fix (strikethrough — "change this")
 *   blue   = question (underline — "clarify this")
 */
export type MemoColor = 'yellow' | 'red' | 'blue'
export type HighlightColor = 'yellow' | 'red' | 'blue'

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: '#fef08a',
  red:    '#fca5a5',
  blue:   '#93c5fd',
}

export const HEX_TO_COLOR_NAME: Record<string, string> = {
  '#fef08a': 'yellow',
  '#fca5a5': 'red',
  '#93c5fd': 'blue',
}

// ─── v0.4.0 State Model ───

export type MemoType = 'fix' | 'question' | 'highlight'
export type MemoStatus = 'open' | 'answered' | 'done' | 'wontfix'
export type MemoOwner = 'human' | 'agent' | 'tool'

export interface MemoV2 {
  id: string
  type: MemoType
  status: MemoStatus
  owner: MemoOwner
  source: string               // 'cursor' | 'cline' | 'copilot' | 'claude' | 'generic' | ...
  color: MemoColor
  text: string
  anchorText: string
  anchor: string               // "L42:L45|a3f8c2d1" — line range + line hash
  createdAt: string
  updatedAt: string
}

/**
 * Quality gate — auto-evaluated based on memo states.
 *
 * Status logic (see gate-evaluator.ts):
 *   1. If blockedBy contains ANY open memos → "blocked"
 *   2. If ALL memos in document are resolved → "done"
 *   3. Otherwise → "proceed"
 *
 * NOTE: `canProceedIf` and `doneDefinition` are human-readable metadata only.
 * They do NOT influence automatic status computation. To enforce conditions,
 * link specific memos via `blockedBy` — the gate stays blocked until those
 * memos are resolved.
 */
export interface Gate {
  id: string
  type: 'merge' | 'release' | 'implement' | 'custom'
  status: 'blocked' | 'proceed' | 'done'
  blockedBy: string[]           // memo IDs — drives automatic status
  /** Human-readable hint shown to agents. Does NOT affect evaluation. */
  canProceedIf: string
  /** Human-readable completion criteria. Does NOT affect evaluation. */
  doneDefinition: string
}

export interface PlanCursor {
  taskId: string
  step: string                  // "3/7" or "Phase 2"
  nextAction: string
  lastSeenHash: string          // body MD5 prefix (8 chars)
  updatedAt: string
}

export interface ReviewResponse {
  id: string                    // auto-generated
  to: string                    // target USER_MEMO id
  bodyStartIdx: number          // line index in bodyLines where response starts
  bodyEndIdx: number            // line index in bodyLines where response ends
}

export interface DocumentParts {
  frontmatter: string           // YAML frontmatter (pass-through, empty if none)
  body: string                  // body markdown (memos/gates/cursor stripped)
  memos: MemoV2[]
  responses: ReviewResponse[]   // AI responses (markers only; text lives in body)
  checkpoints: Checkpoint[]
  gates: Gate[]
  cursor: PlanCursor | null
  unknownComments: string[]     // preserved unknown HTML comments
}

export interface ReviewDocument {
  version: '0.4.0'
  file: string
  bodyMd: string
  memos: MemoV2[]
  checkpoints: Checkpoint[]
  gates: Gate[]
  cursor: PlanCursor | null
  sections: {
    all: string[]
    reviewed: string[]
    uncovered: string[]
  }
  summary: {
    total: number
    open: number
    done: number
    blocked: number
    fixes: number
    questions: number
    highlights: number
  }
}

/** Convert v0.3 color to v0.4 memo type */
export function colorToType(color: MemoColor | string): MemoType {
  if (color === 'red') return 'fix'
  if (color === 'blue') return 'question'
  return 'highlight'
}

// ─── Checkpoint & Handoff types ───

export interface Checkpoint {
  id: string                    // "ckpt_" + nanoid(6)
  timestamp: string             // ISO 8601
  note: string
  fixes: number
  questions: number
  highlights: number
  sectionsReviewed: string[]    // h2 headings with annotations
}

export interface SessionMetadata {
  file: string
  startedAt: string
  lastCheckpoint: string
  checkpointCount: number
  totalFixes: number
  totalQuestions: number
  totalHighlights: number
}

export interface HandoffDocument {
  meta: SessionMetadata
  decisions: HandoffItem[]      // fix annotations → decisions made
  openQuestions: HandoffItem[]  // question annotations → unresolved
  keyPoints: HandoffItem[]      // highlight annotations → key context
  checkpoints: Checkpoint[]
  nextSteps: string[]           // from open questions + uncovered sections
}

export interface HandoffItem {
  section: string
  text: string                  // annotated text
  feedback: string              // memo content
}

/** Accent config for memo cards and bubble menu */
export const MEMO_ACCENT: Record<MemoColor, {
  bar: string
  labelColor: string
  label: string
  emoji: string
  desc: string
}> = {
  yellow: { bar: '#d97706', labelColor: 'text-mf-memo-highlight', label: 'Highlight', emoji: '🟡', desc: 'Personal reading mark' },
  red:    { bar: '#dc2626', labelColor: 'text-mf-memo-fix',       label: 'Fix',       emoji: '🔴', desc: 'This needs to be changed' },
  blue:   { bar: '#2563eb', labelColor: 'text-mf-memo-question',  label: 'Question',  emoji: '🔵', desc: 'Needs clarification' },
}
