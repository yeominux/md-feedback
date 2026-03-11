import type { ReviewHighlight, ReviewMemo } from './types'
import type { FeedbackItem } from './feedback-collector'
import { collectFeedbackItems } from './feedback-collector'
import { truncateText } from './utils'

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
        L.push(`- "${truncateText(f.text, 120)}"${where} → ${f.feedback}`)
      } else if (f.feedback) {
        L.push(`- ${f.feedback}${where}`)
      } else if (f.text) {
        L.push(`- Fix: "${truncateText(f.text, 80)}"${where}`)
      }
    }
    L.push('')
  }

  if (questions.length > 0) {
    L.push('### Open Questions (resolve before implementing)')
    for (const q of questions) {
      const where = q.section ? ` (${q.section})` : ''
      if (q.text && q.feedback) {
        L.push(`- "${truncateText(q.text, 120)}"${where} — ${q.feedback}`)
      } else if (q.feedback) {
        L.push(`- ${q.feedback}${where}`)
      } else if (q.text) {
        L.push(`- Question about: "${truncateText(q.text, 80)}"${where}`)
      }
    }
    L.push('')
  }

  if (importants.length > 0) {
    L.push('### Key Points (preserve these)')
    for (const imp of importants) {
      if (imp.text) L.push(`- "${truncateText(imp.text, 80)}"${imp.section ? ` (${imp.section})` : ''}`)
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
        L.push(`- "${truncateText(f.text, 50)}" → ${f.feedback}`)
      } else if (f.feedback) {
        L.push(`- ${f.feedback}`)
      }
    }
    L.push('')
  }

  if (questions.length > 0) {
    L.push('Open questions (resolve before coding):')
    for (const q of questions) {
      L.push(`- ${q.feedback || truncateText(q.text, 80)}`)
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
        L.push(`- "${truncateText(f.text, 120)}"${where} → ${f.feedback}`)
      } else if (f.feedback) {
        L.push(`- ${f.feedback}${where}`)
      } else if (f.text) {
        L.push(`- "${truncateText(f.text, 80)}"${where}`)
      }
    }
    L.push('')
  }

  if (questions.length > 0) {
    L.push('## Questions')
    for (const q of questions) {
      const where = q.section ? ` [${q.section}]` : ''
      if (q.text && q.feedback) {
        L.push(`- "${truncateText(q.text, 120)}"${where} — ${q.feedback}`)
      } else if (q.feedback) {
        L.push(`- ${q.feedback}${where}`)
      }
    }
    L.push('')
  }

  if (importants.length > 0) {
    L.push('## Key Points')
    for (const imp of importants) {
      if (imp.text) L.push(`- "${truncateText(imp.text, 80)}"`)
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
  L.push('*Generated by [md-feedback](https://github.com/yeominux/md-feedback). Delete when done.*')

  return L.join('\n')
}

type ContextGenerator = (
  title: string,
  filePath: string,
  sections: string[],
  fixes: FeedbackItem[],
  questions: FeedbackItem[],
  importants: FeedbackItem[],
) => string

const CONTEXT_GENERATORS: Record<Exclude<TargetFormat, 'handoff'>, ContextGenerator> = {
  cursor: generateCursor,
  generic: generateGeneric,
  'claude-code': generateClaudeCode,
  codex: generateClaudeCode,
  copilot: generateClaudeCode,
  cline: generateClaudeCode,
  windsurf: generateClaudeCode,
  'roo-code': generateClaudeCode,
  gemini: generateClaudeCode,
  antigravity: generateClaudeCode,
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
  const items = collectFeedbackItems(highlights, docMemos)

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

  if (target === 'handoff') {
    // Handoff is generated via handoff-generator.ts, not here
    return '(Use Export > Handoff to generate handoff document)'
  }

  const generator = CONTEXT_GENERATORS[target]
  return generator(title, filePath, sections, fixes, questions, importants)
}
