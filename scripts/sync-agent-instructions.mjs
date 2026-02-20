#!/usr/bin/env node
/**
 * sync-agent-instructions.mjs — Copy CLAUDE.md → all AI environment config files.
 *
 * Source of truth: CLAUDE.md
 * Targets: AGENTS.md, .github/copilot-instructions.md, .cursorrules
 *
 * Run: pnpm sync:agents
 */
import { readFileSync, writeFileSync } from 'fs'

const SOURCE = 'CLAUDE.md'
const TARGETS = [
  'AGENTS.md',
  '.github/copilot-instructions.md',
  '.cursorrules',
]

const content = readFileSync(SOURCE, 'utf8')
let synced = 0

for (const target of TARGETS) {
  try {
    const existing = readFileSync(target, 'utf8')
    if (existing === content) continue
  } catch { /* file doesn't exist yet */ }
  writeFileSync(target, content, 'utf8')
  console.log(`  ✓ ${target}`)
  synced++
}

if (synced === 0) {
  console.log('  All targets already in sync.')
} else {
  console.log(`\n  Synced ${synced} file(s) from ${SOURCE}.`)
}
