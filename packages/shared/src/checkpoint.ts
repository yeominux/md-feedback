import type { Checkpoint } from './types'
import { extractCheckpoints } from './markdown-roundtrip'
import { serializeCheckpoint } from './document-writer'
import { splitDocument } from './document-writer'
import { generateId } from './id'

// ─── Annotation counting ───

export interface AnnotationCounts {
  fixes: number
  questions: number
  highlights: number
}

/** Count annotations by type from raw annotated markdown.
 *  Uses USER_MEMO as the single source of truth — <mark> tags and ==text==
 *  are visual representations of the same annotations, not separate items. */
export function getAnnotationCounts(markdown: string): AnnotationCounts {
  let fixes = 0
  let questions = 0
  let highlights = 0

  const parts = splitDocument(markdown)
  for (const memo of parts.memos) {
    const color = memo.color || 'red'
    if (color === 'red') fixes++
    else if (color === 'blue') questions++
    else highlights++
  }

  return { fixes, questions, highlights }
}

// ─── Section detection ───

/** Extract h2 headings that have annotations nearby */
export function getSectionsWithAnnotations(markdown: string): string[] {
  const lines = markdown.split('\n')
  const sections: string[] = []
  const seenSections = new Set<string>()
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

    if (hasAnnotation && !seenSections.has(currentSection)) {
      seenSections.add(currentSection)
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
    id: generateId('ckpt', { separator: '_' }),
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
