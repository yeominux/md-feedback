import type { Checkpoint, HandoffDocument, HandoffItem, SessionMetadata } from './types'
import { HEX_TO_COLOR_NAME } from './types'
import { extractCheckpoints, extractMemos } from './markdown-roundtrip'
import { getAnnotationCounts, getSectionsWithAnnotations, getAllSections } from './checkpoint'

// ─── Build HandoffDocument from annotated markdown ───

export function buildHandoffDocument(markdown: string, filePath: string): HandoffDocument {
  const checkpoints = extractCheckpoints(markdown)
  const counts = getAnnotationCounts(markdown)
  const reviewedSections = getSectionsWithAnnotations(markdown)
  const allSections = getAllSections(markdown)

  const meta: SessionMetadata = {
    file: filePath,
    startedAt: checkpoints.length > 0 ? checkpoints[0].timestamp : new Date().toISOString(),
    lastCheckpoint: checkpoints.length > 0 ? checkpoints[checkpoints.length - 1].timestamp : '',
    checkpointCount: checkpoints.length,
    totalFixes: counts.fixes,
    totalQuestions: counts.questions,
    totalHighlights: counts.highlights,
  }

  // Extract annotated items by type
  const decisions: HandoffItem[] = []
  const openQuestions: HandoffItem[] = []
  const keyPoints: HandoffItem[] = []

  collectAnnotatedItems(markdown, decisions, openQuestions, keyPoints)

  // Derive next steps
  const nextSteps: string[] = []
  for (const q of openQuestions) {
    nextSteps.push(`Resolve: ${q.feedback || q.text}`)
  }
  const uncovered = allSections.filter(s => !reviewedSections.includes(s))
  for (const s of uncovered) {
    nextSteps.push(`Review uncovered: ${s} section`)
  }

  return { meta, decisions, openQuestions, keyPoints, checkpoints, nextSteps }
}

// ─── Collect annotated items from markdown ───

function collectAnnotatedItems(
  markdown: string,
  decisions: HandoffItem[],
  openQuestions: HandoffItem[],
  keyPoints: HandoffItem[],
): void {
  const lines = markdown.split('\n')
  let currentSection = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const h2Match = line.match(/^## (.+)/)
    if (h2Match) {
      currentSection = h2Match[1].trim()
      continue
    }

    // Match USER_MEMO annotations
    const memoMatch = line.match(/<!-- USER_MEMO\s+id="[^"]+"(?:\s+color="([^"]+)")?\s*:\s*(.*?)\s*-->/)
    if (memoMatch) {
      const color = memoMatch[1] || 'red'
      const feedback = memoMatch[2].replace(/--\u200B>/g, '-->')

      // Find the annotated text (previous non-empty line)
      let text = ''
      for (let j = i - 1; j >= 0; j--) {
        if (lines[j].trim() && !lines[j].includes('<!-- ')) {
          text = lines[j].trim()
          // Strip mark tags
          text = text.replace(/<\/?mark[^>]*>/g, '')
          break
        }
      }

      const item: HandoffItem = { section: currentSection, text, feedback }

      if (color === 'red') decisions.push(item)
      else if (color === 'blue') openQuestions.push(item)
      else keyPoints.push(item)
    }

    // Match standalone <mark> highlights (no memo following) — 3 formats
    const markMatch = line.match(/<mark[^>]*(?:data-color="([^"]+)"|style="background-color:\s*([^"]+)")?\s*>(.*?)<\/mark>/)
      || line.match(/==(.*?)==/)
    if (markMatch) {
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''
      if (nextLine.includes('<!-- USER_MEMO')) continue // will be handled above

      let text: string
      let cn: string
      if (markMatch.length === 2) {
        // ==text== pattern → yellow highlight
        text = markMatch[1]
        cn = 'yellow'
      } else {
        const hex = (markMatch[1] || markMatch[2] || '').trim()
        cn = HEX_TO_COLOR_NAME[hex] || 'yellow'
        text = markMatch[3]
      }
      const item: HandoffItem = { section: currentSection, text, feedback: '' }

      if (cn === 'red') decisions.push(item)
      else if (cn === 'blue') openQuestions.push(item)
      else keyPoints.push(item)
    }
  }
}

// ─── Format handoff as markdown ───

function trunc(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + '...' : s
}

export function formatHandoffMarkdown(
  doc: HandoffDocument,
  target: 'standalone' | 'claude-md' | 'cursor-rules' = 'standalone',
): string {
  const L: string[] = []

  if (target === 'standalone') {
    L.push(`# HANDOFF — \`${doc.meta.file}\``)
    L.push('')
  } else if (target === 'claude-md') {
    L.push(`## Session Handoff: ${doc.meta.file}`)
    L.push('')
  } else {
    L.push('---')
    L.push(`description: Session handoff for ${doc.meta.file}`)
    L.push('alwaysApply: true')
    L.push('---')
    L.push('')
  }

  // Session metadata
  L.push('## Session')
  L.push(`- **File**: \`${doc.meta.file}\``)
  L.push(`- **Started**: ${doc.meta.startedAt}`)
  if (doc.meta.lastCheckpoint) {
    L.push(`- **Last checkpoint**: ${doc.meta.lastCheckpoint}`)
  }
  L.push(`- **Checkpoints**: ${doc.meta.checkpointCount}`)
  L.push(`- **Annotations**: ${doc.meta.totalFixes} fix, ${doc.meta.totalQuestions} question, ${doc.meta.totalHighlights} highlight`)
  L.push('')

  // Decisions
  if (doc.decisions.length > 0) {
    L.push(`## Decisions Made (${doc.decisions.length})`)
    L.push('Marked as FIX. Decided — implement as specified.')
    for (let i = 0; i < doc.decisions.length; i++) {
      const d = doc.decisions[i]
      const section = d.section ? `[${d.section}]` : '[General]'
      if (d.text && d.feedback) {
        L.push(`${i + 1}. **${section}** "${trunc(d.text, 60)}" → ${d.feedback}`)
      } else if (d.feedback) {
        L.push(`${i + 1}. **${section}** ${d.feedback}`)
      } else if (d.text) {
        L.push(`${i + 1}. **${section}** "${trunc(d.text, 80)}"`)
      }
    }
    L.push('')
  }

  // Open questions
  if (doc.openQuestions.length > 0) {
    L.push(`## Open Questions (${doc.openQuestions.length})`)
    L.push('Marked as QUESTION. Unresolved — investigate before implementing.')
    for (let i = 0; i < doc.openQuestions.length; i++) {
      const q = doc.openQuestions[i]
      const section = q.section ? `[${q.section}]` : '[General]'
      if (q.text && q.feedback) {
        L.push(`${i + 1}. **${section}** "${trunc(q.text, 60)}" — ${q.feedback}`)
      } else if (q.feedback) {
        L.push(`${i + 1}. **${section}** ${q.feedback}`)
      } else if (q.text) {
        L.push(`${i + 1}. **${section}** "${trunc(q.text, 80)}"`)
      }
    }
    L.push('')
  }

  // Key points
  if (doc.keyPoints.length > 0) {
    L.push(`## Key Points (${doc.keyPoints.length})`)
    L.push('Marked as HIGHLIGHT. Important context — preserve during implementation.')
    for (let i = 0; i < doc.keyPoints.length; i++) {
      const k = doc.keyPoints[i]
      const section = k.section ? `[${k.section}]` : '[General]'
      if (k.text) {
        L.push(`${i + 1}. **${section}** "${trunc(k.text, 80)}"`)
      }
      if (k.feedback) {
        L.push(`   ${k.feedback}`)
      }
    }
    L.push('')
  }

  // Progress checkpoints
  if (doc.checkpoints.length > 0) {
    L.push('## Progress Checkpoints')
    L.push('| # | Time | Note | Fixes | Questions | Highlights |')
    L.push('|---|------|------|-------|-----------|------------|')
    for (let i = 0; i < doc.checkpoints.length; i++) {
      const cp = doc.checkpoints[i]
      const time = cp.timestamp.split('T')[1]?.split('.')[0] || cp.timestamp
      L.push(`| ${i + 1} | ${time} | ${cp.note} | ${cp.fixes} | ${cp.questions} | ${cp.highlights} |`)
    }
    L.push('')
  }

  // Next steps
  if (doc.nextSteps.length > 0) {
    L.push('## Next Steps')
    for (const step of doc.nextSteps) {
      L.push(`- [ ] ${step}`)
    }
    L.push('')
  }

  L.push('---')
  L.push('*Generated by md-feedback. Feed this to your AI coding agent.*')

  return L.join('\n')
}

// ─── Parse handoff file back to HandoffDocument ───

export function parseHandoffFile(markdown: string): HandoffDocument | null {
  const lines = markdown.split('\n')
  let currentSection = ''

  const meta: SessionMetadata = {
    file: '', startedAt: '', lastCheckpoint: '',
    checkpointCount: 0, totalFixes: 0, totalQuestions: 0, totalHighlights: 0,
  }
  const decisions: HandoffItem[] = []
  const openQuestions: HandoffItem[] = []
  const keyPoints: HandoffItem[] = []
  const checkpoints: Checkpoint[] = []
  const nextSteps: string[] = []

  for (const line of lines) {
    const h2 = line.match(/^## (.+)/)
    if (h2) { currentSection = h2[1].trim(); continue }

    // Parse session metadata
    if (currentSection.startsWith('Session')) {
      const fileMatch = line.match(/\*\*File\*\*:\s*`([^`]+)`/)
      if (fileMatch) meta.file = fileMatch[1]
      const startedMatch = line.match(/\*\*Started\*\*:\s*(.+)/)
      if (startedMatch) meta.startedAt = startedMatch[1].trim()
      const lastMatch = line.match(/\*\*Last checkpoint\*\*:\s*(.+)/)
      if (lastMatch) meta.lastCheckpoint = lastMatch[1].trim()
      const cpMatch = line.match(/\*\*Checkpoints\*\*:\s*(\d+)/)
      if (cpMatch) meta.checkpointCount = parseInt(cpMatch[1], 10)
      const annMatch = line.match(/\*\*Annotations\*\*:\s*(\d+)\s*fix,\s*(\d+)\s*question,\s*(\d+)\s*highlight/)
      if (annMatch) {
        meta.totalFixes = parseInt(annMatch[1], 10)
        meta.totalQuestions = parseInt(annMatch[2], 10)
        meta.totalHighlights = parseInt(annMatch[3], 10)
      }
    }

    // Parse list items in decisions/questions/keypoints sections
    const itemMatch = line.match(/^\d+\.\s+\*\*\[([^\]]*)\]\*\*\s+(.+)/)
    if (itemMatch) {
      const section = itemMatch[1]
      const rest = itemMatch[2]
      const arrowMatch = rest.match(/"([^"]+)"\s*→\s*(.+)/)
      const dashMatch = rest.match(/"([^"]+)"\s*—\s*(.+)/)

      let item: HandoffItem
      if (arrowMatch) {
        item = { section, text: arrowMatch[1], feedback: arrowMatch[2] }
      } else if (dashMatch) {
        item = { section, text: dashMatch[1], feedback: dashMatch[2] }
      } else {
        const quoted = rest.match(/"([^"]+)"/)
        item = { section, text: quoted ? quoted[1] : '', feedback: quoted ? '' : rest }
      }

      if (currentSection.startsWith('Decisions')) decisions.push(item)
      else if (currentSection.startsWith('Open Questions')) openQuestions.push(item)
      else if (currentSection.startsWith('Key Points')) keyPoints.push(item)
    }

    // Parse next steps
    if (currentSection.startsWith('Next Steps')) {
      const stepMatch = line.match(/^- \[ \]\s+(.+)/)
      if (stepMatch) nextSteps.push(stepMatch[1])
    }
  }

  if (!meta.file) return null

  return { meta, decisions, openQuestions, keyPoints, checkpoints, nextSteps }
}
