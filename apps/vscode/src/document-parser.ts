/**
 * Document Parser — Split/Merge Pipeline
 * 
 * v0.3.0 scope: Parser (readers) ONLY. No writers.
 * 
 * Extracts { bodyMd, memos[], checkpoints[] } from raw markdown.
 * Foundation for safe compaction in future versions.
 * 
 * Key behaviors:
 * - Tolerant parsing: unknown HTML comments preserved in bodyMd
 * - Roundtrip safety: rawComment stores exact original line
 * - Line tracking: lineIndex stores 0-based position
 * - No trailing whitespace stripping on bodyMd
 */

/**
 * Parsed document structure
 */
export interface ParsedDocument {
  bodyMd: string           // memos/checkpoints removed, pure markdown
  memos: ParsedMemo[]      // extracted USER_MEMO list
  checkpoints: ParsedCheckpoint[]  // extracted CHECKPOINT list
}

/**
 * Extracted memo with original position and line reference
 */
export interface ParsedMemo {
  id: string
  color: string
  text: string
  rawComment: string       // full original HTML comment (for roundtrip)
  lineIndex: number        // line position in original document
}

/**
 * Extracted checkpoint with original position and line reference
 */
export interface ParsedCheckpoint {
  id: string
  time: string
  note: string
  fixes: number
  questions: number
  highlights: number
  sections: string
  rawComment: string       // full original HTML comment
  lineIndex: number
}

/**
 * Regex pattern for USER_MEMO extraction
 * Format: <!-- USER_MEMO id="..." [color="..."] : text -->
 * 
 * Reference: shared/markdown-roundtrip.ts:23
 */
const USER_MEMO_RE = /<!-- USER_MEMO\s+id="([^"]+)"(?:\s+color="([^"]+)")?\s*:\s*(.*?)\s*-->/

/**
 * Regex pattern for CHECKPOINT extraction
 * Format: <!-- CHECKPOINT id="..." time="..." note="..." fixes=N questions=N highlights=N sections="..." -->
 * 
 * Reference: shared/markdown-roundtrip.ts:260
 */
const CHECKPOINT_RE = /<!-- CHECKPOINT id="([^"]+)" time="([^"]+)" note="([^"]*)" fixes=(\d+) questions=(\d+) highlights=(\d+) sections="([^"]*)" -->/

/**
 * Parse raw markdown into structured document with separated body, memos, and checkpoints
 * 
 * Algorithm:
 * 1. Split raw markdown into lines
 * 2. Iterate line by line
 * 3. Match USER_MEMO pattern → add to memos[], skip from bodyMd
 * 4. Match CHECKPOINT pattern → add to checkpoints[], skip from bodyMd
 * 5. Unknown HTML comments → PRESERVE in bodyMd (tolerant parsing)
 * 6. Everything else → add to bodyMd
 * 7. Return { bodyMd, memos, checkpoints }
 * 
 * @param raw - Raw markdown string
 * @returns Parsed document with separated body, memos, and checkpoints
 */
export function parseDocument(raw: string): ParsedDocument {
  const lines = raw.split('\n')
  const memos: ParsedMemo[] = []
  const checkpoints: ParsedCheckpoint[] = []
  const bodyLines: string[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]

    // Try to match USER_MEMO pattern
    const memoMatch = line.match(USER_MEMO_RE)
    if (memoMatch) {
      memos.push({
        id: memoMatch[1],
        color: memoMatch[2] || '#fca5a5', // default red hex
        text: memoMatch[3],
        rawComment: line,
        lineIndex,
      })
      continue
    }

    // Try to match CHECKPOINT pattern
    const checkpointMatch = line.match(CHECKPOINT_RE)
    if (checkpointMatch) {
      checkpoints.push({
        id: checkpointMatch[1],
        time: checkpointMatch[2],
        note: checkpointMatch[3],
        fixes: parseInt(checkpointMatch[4], 10),
        questions: parseInt(checkpointMatch[5], 10),
        highlights: parseInt(checkpointMatch[6], 10),
        sections: checkpointMatch[7],
        rawComment: line,
        lineIndex,
      })
      continue
    }

    // Tolerant parsing: preserve everything else (including unknown HTML comments)
    bodyLines.push(line)
  }

  // Reconstruct bodyMd from preserved lines (no trailing whitespace stripping)
  const bodyMd = bodyLines.join('\n')

  return {
    bodyMd,
    memos,
    checkpoints,
  }
}
