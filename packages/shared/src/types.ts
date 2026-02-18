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

/** Persisted highlight mark — stored as HTML comments in markdown */
export interface HighlightMark {
  color: string       // hex color (#fef08a, #fca5a5, #93c5fd)
  text: string        // highlighted text fragment
  anchor: string      // first N chars of containing block (for matching on reload)
}

// ─── v0.4.0 State Model ───

export type MemoType = 'fix' | 'question' | 'highlight'
export type MemoStatus = 'open' | 'in_progress' | 'needs_review' | 'answered' | 'done' | 'failed' | 'wontfix'

/** Check if a memo status is considered "resolved" (not blocking gates) */
export function isResolved(status: MemoStatus): boolean {
  return status === 'answered' || status === 'done' || status === 'failed' || status === 'wontfix'
}

/** Statuses an AI agent is allowed to set via MCP tools */
export const AGENT_ALLOWED_STATUSES: MemoStatus[] = ['open', 'in_progress', 'needs_review']

/** Statuses that require human action (VS Code CodeLens) */
export const HUMAN_ONLY_STATUSES: MemoStatus[] = ['answered', 'done', 'failed', 'wontfix']

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
  /** Human override — skips auto-evaluation when set */
  override?: 'blocked' | 'proceed' | 'done' | null
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

// ─── v1.1.0 Implementation Tracking ───

export type ImplStatus = 'applied' | 'reverted' | 'partial' | 'failed'

export interface TextReplaceOp {
  type: 'text_replace'
  file: string        // relative file path (empty string = current document)
  before: string
  after: string
}

export interface FilePatchOp {
  type: 'file_patch'
  file: string
  patch: string       // unified diff format
}

export interface FileCreateOp {
  type: 'file_create'
  file: string
  content: string
}

export type ImplOperation = TextReplaceOp | FilePatchOp | FileCreateOp

export interface MemoImpl {
  id: string           // "impl_" + nanoid(6)
  memoId: string       // links to MemoV2.id
  status: ImplStatus
  operations: ImplOperation[]
  summary: string      // human-readable summary
  appliedAt: string    // ISO 8601
}

// ─── v1.2.0 Code Execution Bridge ───

export interface MemoArtifact {
  id: string           // "art_" + nanoid(6)
  memoId: string       // links to MemoV2.id
  files: string[]      // relative file paths linked to this memo
  linkedAt: string     // ISO 8601
}

// ─── v1.3.0 Dependencies ───

export interface MemoDependency {
  id: string           // "dep_" + nanoid(6)
  from: string         // memo ID
  to: string           // memo ID (from depends on to)
  type: 'blocks' | 'related'
}

export interface DocumentParts {
  frontmatter: string           // YAML frontmatter (pass-through, empty if none)
  body: string                  // body markdown (memos/gates/cursor stripped)
  memos: MemoV2[]
  responses: ReviewResponse[]   // AI responses (markers only; text lives in body)
  impls: MemoImpl[]             // implementation records (v1.1+)
  artifacts: MemoArtifact[]     // linked file artifacts (v1.2+)
  dependencies: MemoDependency[] // memo dependencies (v1.3+)
  checkpoints: Checkpoint[]
  gates: Gate[]
  cursor: PlanCursor | null
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
  impls: MemoImpl[]
  artifacts: MemoArtifact[]
  dependencies: MemoDependency[]
  summary: {
    total: number
    open: number
    inProgress: number
    needsReview: number
    answered: number
    done: number
    failed: number
    wontfix: number
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
