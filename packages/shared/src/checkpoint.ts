import type { Checkpoint } from './types'
import { HEX_TO_COLOR_NAME } from './types'
import { extractCheckpoints, serializeCheckpoint } from './markdown-roundtrip'

// ─── ID generation (no external deps) ───

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
function nanoid6(): string {
  let id = ''
  for (let i = 0; i < 6; i++) {
    id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return id
}

// ─── Annotation counting ───

export interface AnnotationCounts {
  fixes: number
  questions: number
  highlights: number
}

/** Count annotations by type from raw annotated markdown */
export function getAnnotationCounts(markdown: string): AnnotationCounts {
  let fixes = 0
  let questions = 0
  let highlights = 0

  // Count USER_MEMO comments by color
  const memoRe = /<!-- USER_MEMO\s+id="[^"]+"(?:\s+color="([^"]+)")?(?:\s+status="[^"]+")?\s*:/g
  let m: RegExpExecArray | null
  while ((m = memoRe.exec(markdown)) !== null) {
    const color = m[1] || 'red'
    if (color === 'red') fixes++
    else if (color === 'blue') questions++
    else highlights++
  }

  // Count <mark> highlights with style (inline annotations without memos)
  const markRe = /<mark[^>]*style="background-color:\s*([^"]+)"[^>]*>/g
  while ((m = markRe.exec(markdown)) !== null) {
    const hex = m[1].trim()
    const cn = HEX_TO_COLOR_NAME[hex]
    if (cn === 'red') fixes++
    else if (cn === 'blue') questions++
    else highlights++
  }

  // Count == == highlights (normalized to <mark>)
  const eqRe = /(?<!`)==(?!.*==.*`)(.+?)==(?!`)/g
  while (eqRe.exec(markdown) !== null) {
    highlights++
  }

  return { fixes, questions, highlights }
}

// ─── Section detection ───

/** Extract h2 headings that have annotations nearby */
export function getSectionsWithAnnotations(markdown: string): string[] {
  const lines = markdown.split('\n')
  const sections: string[] = []
  let currentSection = ''

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)/)
    if (h2Match) {
      currentSection = h2Match[1].trim()
      continue
    }

    if (!currentSection) continue

    // Check if this line has annotation markers
    const hasAnnotation =
      line.includes('<!-- USER_MEMO') ||
      line.includes('<mark') ||
      /(?<!`)==.+==(?!`)/.test(line)

    if (hasAnnotation && !sections.includes(currentSection)) {
      sections.push(currentSection)
    }
  }

  return sections
}

/** Extract all h2 headings from markdown */
export function getAllSections(markdown: string): string[] {
  const sections: string[] = []
  for (const line of markdown.split('\n')) {
    const m = line.match(/^## (.+)/)
    if (m) sections.push(m[1].trim())
  }
  return sections
}

// ─── Checkpoint creation ───

export function createCheckpoint(
  markdown: string,
  note: string,
): { checkpoint: Checkpoint; updatedMarkdown: string } {
  const counts = getAnnotationCounts(markdown)
  const sectionsReviewed = getSectionsWithAnnotations(markdown)

  const checkpoint: Checkpoint = {
    id: `ckpt_${nanoid6()}`,
    timestamp: new Date().toISOString(),
    note,
    fixes: counts.fixes,
    questions: counts.questions,
    highlights: counts.highlights,
    sectionsReviewed,
  }

  const comment = serializeCheckpoint(checkpoint)

  // Append checkpoint at the end of the document
  const trimmed = markdown.trimEnd()
  const updatedMarkdown = trimmed + '\n\n' + comment + '\n'

  return { checkpoint, updatedMarkdown }
}

export { extractCheckpoints }
