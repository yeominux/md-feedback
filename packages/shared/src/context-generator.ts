import type { ReviewHighlight, ReviewMemo } from './types'
import { HEX_TO_COLOR_NAME } from './types'

export type TargetFormat =
  | 'claude-code' | 'cursor' | 'codex' | 'copilot' | 'cline'
  | 'windsurf' | 'roo-code' | 'gemini' | 'antigravity'
  | 'generic' | 'handoff'

export const TARGET_LABELS: Record<TargetFormat, { label: string; file: string; desc: string }> = {
  'claude-code': { label: 'Claude Code', file: 'CLAUDE.md', desc: 'Auto-loaded by Claude Code CLI' },
  'cursor':      { label: 'Cursor',      file: '.cursor/rules/plan-review.mdc', desc: 'Auto-loaded by Cursor AI' },
  'codex':       { label: 'Codex',       file: 'AGENTS.md', desc: 'Auto-loaded by OpenAI Codex CLI' },
  'copilot':     { label: 'GitHub Copilot', file: '.github/copilot-instructions.md', desc: 'Auto-loaded by Copilot Chat' },
  'cline':       { label: 'Cline',       file: '.clinerules', desc: 'Auto-loaded by Cline extension' },
  'windsurf':    { label: 'Windsurf',    file: '.windsurfrules', desc: 'Auto-loaded by Windsurf Cascade' },
  'roo-code':    { label: 'Roo Code',    file: '.roo/rules/plan-review.md', desc: 'Auto-loaded by Roo Code in Code mode' },
  'gemini':      { label: 'Gemini',      file: '.gemini/styleguide.md', desc: 'Auto-loaded by Gemini Code Assist' },
  'antigravity': { label: 'Antigravity', file: '.agent/rules/plan-review.md', desc: 'Auto-loaded by Google Antigravity' },
  'generic':     { label: 'Generic Markdown', file: '(clipboard + file)', desc: 'Works with any AI tool (OpenCode, Aider, Lovable, etc.)' },
  'handoff':     { label: 'Handoff', file: 'HANDOFF.md', desc: 'Session handoff document for AI coding agents' },
}

interface FeedbackItem {
  type: 'fix' | 'question' | 'important'
  text: string
  section: string
  feedback: string
}

function collectFeedback(
  highlights: ReviewHighlight[],
  docMemos: ReviewMemo[],
): FeedbackItem[] {
  const items: FeedbackItem[] = []
  const matchedHighlights = new Set<number>()

  for (const memo of docMemos) {
    const cn = memo.color.startsWith('#') ? (HEX_TO_COLOR_NAME[memo.color] || 'red') : memo.color
    const type = cn === 'red' ? 'fix' : cn === 'blue' ? 'question' : 'important'

    const hlColor = cn === 'red' ? '#fca5a5' : cn === 'blue' ? '#93c5fd' : '#fef08a'
    const hlIdx = highlights.findIndex((hl, idx) =>
      !matchedHighlights.has(idx) && hl.color === hlColor && memo.section.trim() === hl.section.trim(),
    )

    if (hlIdx >= 0) {
      matchedHighlights.add(hlIdx)
      items.push({
        type,
        text: highlights[hlIdx].text,
        section: memo.section || highlights[hlIdx].section || '',
        feedback: memo.text,
      })
    } else {
      items.push({
        type,
        text: memo.context || '',
        section: memo.section || '',
        feedback: memo.text,
      })
    }
  }

  for (let i = 0; i < highlights.length; i++) {
    if (matchedHighlights.has(i)) continue
    const hl = highlights[i]
    const cn = HEX_TO_COLOR_NAME[hl.color] || 'yellow'
    const type = cn === 'red' ? 'fix' : cn === 'blue' ? 'question' : 'important'
    items.push({
      type,
      text: hl.text,
      section: hl.section || '',
      feedback: '',
    })
  }

  return items
}

function trunc(s: string, len = 120): string {
  return s.length > len ? s.slice(0, len) + '...' : s
}

function buildChecklist(sections: string[]): string {
  if (sections.length === 0) return ''
  return sections.map(s => `- [ ] ${s}`).join('\n')
}

// ─── Claude Code (CLAUDE.md) ───

function generateClaudeCode(
  title: string, filePath: string, sections: string[],
  fixes: FeedbackItem[], questions: FeedbackItem[], importants: FeedbackItem[],
): string {
  const L: string[] = []
  const fp = filePath || 'docs/plan.md'

  L.push(`## Active Plan Review: ${fp}`)
  L.push(`Follow this plan. Refer to ${fp} for details.`)
  L.push('')

  if (fixes.length > 0) {
    L.push('### Must Fix')
    for (const f of fixes) {
      const where = f.section ? ` (${f.section})` : ''
      if (f.text && f.feedback) {
        L.push(`- "${trunc(f.text, 120)}"${where} → ${f.feedback}`)
      } else if (f.feedback) {
        L.push(`- ${f.feedback}${where}`)
      } else if (f.text) {
        L.push(`- Fix: "${trunc(f.text, 80)}"${where}`)
      }
    }
    L.push('')
  }

  if (questions.length > 0) {
    L.push('### Open Questions (resolve before implementing)')
    for (const q of questions) {
      const where = q.section ? ` (${q.section})` : ''
      if (q.text && q.feedback) {
        L.push(`- "${trunc(q.text, 120)}"${where} — ${q.feedback}`)
      } else if (q.feedback) {
        L.push(`- ${q.feedback}${where}`)
      } else if (q.text) {
        L.push(`- Question about: "${trunc(q.text, 80)}"${where}`)
      }
    }
    L.push('')
  }

  if (importants.length > 0) {
    L.push('### Key Points (preserve these)')
    for (const imp of importants) {
      if (imp.text) L.push(`- "${trunc(imp.text, 80)}"${imp.section ? ` (${imp.section})` : ''}`)
      if (imp.feedback) L.push(`- ${imp.feedback}`)
    }
    L.push('')
  }

  if (sections.length > 0) {
    L.push('### Checklist')
    L.push(buildChecklist(sections))
    L.push('')
  }

  L.push('When all items are complete, delete this section.')

  return L.join('\n')
}

// ─── Cursor (.cursor/rules/plan-review.mdc) ───

function generateCursor(
  title: string, filePath: string, sections: string[],
  fixes: FeedbackItem[], questions: FeedbackItem[], importants: FeedbackItem[],
): string {
  const L: string[] = []
  const fp = filePath || 'docs/plan.md'

  L.push('---')
  L.push(`description: Plan review feedback for ${title || fp}`)
  L.push('alwaysApply: true')
  L.push('---')
  L.push('')
  L.push(`Follow the plan at ${fp} strictly.`)
  L.push('')

  if (fixes.length > 0) {
    L.push('Required changes:')
    for (const f of fixes) {
      if (f.text && f.feedback) {
        L.push(`- "${trunc(f.text, 50)}" → ${f.feedback}`)
      } else if (f.feedback) {
        L.push(`- ${f.feedback}`)
      }
    }
    L.push('')
  }

  if (questions.length > 0) {
    L.push('Open questions (resolve before coding):')
    for (const q of questions) {
      L.push(`- ${q.feedback || trunc(q.text, 80)}`)
    }
    L.push('')
  }

  if (sections.length > 0) {
    L.push('Checklist:')
    for (const s of sections) { L.push(`- [ ] ${s}`) }
    L.push('')
  }

  L.push('Remove this file when all items are complete.')

  return L.join('\n')
}

// ─── Generic Markdown ───

function generateGeneric(
  title: string, filePath: string, sections: string[],
  fixes: FeedbackItem[], questions: FeedbackItem[], importants: FeedbackItem[],
): string {
  const L: string[] = []
  const fp = filePath || 'docs/plan.md'
  const docTitle = title || 'Untitled Plan'

  L.push(`# Plan Review Context — ${docTitle}`)
  L.push('')
  L.push(`**Source:** \`${fp}\``)
  L.push(`**Reviewed:** ${new Date().toISOString().split('T')[0]}`)
  L.push('')

  if (fixes.length > 0) {
    L.push('## Must Fix')
    for (const f of fixes) {
      const where = f.section ? ` [${f.section}]` : ''
      if (f.text && f.feedback) {
        L.push(`- "${trunc(f.text, 120)}"${where} → ${f.feedback}`)
      } else if (f.feedback) {
        L.push(`- ${f.feedback}${where}`)
      } else if (f.text) {
        L.push(`- "${trunc(f.text, 80)}"${where}`)
      }
    }
    L.push('')
  }

  if (questions.length > 0) {
    L.push('## Questions')
    for (const q of questions) {
      const where = q.section ? ` [${q.section}]` : ''
      if (q.text && q.feedback) {
        L.push(`- "${trunc(q.text, 120)}"${where} — ${q.feedback}`)
      } else if (q.feedback) {
        L.push(`- ${q.feedback}${where}`)
      }
    }
    L.push('')
  }

  if (importants.length > 0) {
    L.push('## Key Points')
    for (const imp of importants) {
      if (imp.text) L.push(`- "${trunc(imp.text, 80)}"`)
      if (imp.feedback) L.push(`- ${imp.feedback}`)
    }
    L.push('')
  }

  if (sections.length > 0) {
    L.push('## Checklist')
    L.push(buildChecklist(sections))
    L.push('')
  }

  L.push('---')
  L.push('*Generated by [md-feedback](https://github.com/yeominux/md-feedback-clean). Delete when done.*')

  return L.join('\n')
}

// ─── Public API ───

export function generateContext(
  title: string,
  filePath: string,
  sections: string[],
  highlights: ReviewHighlight[],
  docMemos: ReviewMemo[],
  target: TargetFormat,
): string {
  const items = collectFeedback(highlights, docMemos)

  if (items.length === 0 && sections.length === 0) {
    return [
      '## No annotations found',
      '',
      'Select text in the editor and press **1** (highlight), **2** (fix), or **3** (question) to annotate.',
      'Then export again to generate context for your AI tool.',
    ].join('\n')
  }

  const fixes = items.filter(i => i.type === 'fix')
  const questions = items.filter(i => i.type === 'question')
  const importants = items.filter(i => i.type === 'important')

  switch (target) {
    case 'claude-code':
    case 'codex':
    case 'copilot':
    case 'cline':
    case 'windsurf':
    case 'roo-code':
    case 'gemini':
    case 'antigravity':
      return generateClaudeCode(title, filePath, sections, fixes, questions, importants)
    case 'cursor':
      return generateCursor(title, filePath, sections, fixes, questions, importants)
    case 'generic':
      return generateGeneric(title, filePath, sections, fixes, questions, importants)
    case 'handoff':
      // Handoff is generated via handoff-generator.ts, not here
      return '(Use Export > Handoff to generate handoff document)'
  }
}
