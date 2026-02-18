#!/usr/bin/env node
import { readFileSync } from 'fs'

const docs = [
  { path: 'README.md', name: 'Root README (GitHub)' },
  { path: 'README.ko.md', name: 'Root README (Korean)' },
  { path: 'apps/vscode/README.md', name: 'Marketplace README' },
]

const banned = [
  /\bfeat:\b/i,
  /\bfix:\b/i,
  /\bchore:\b/i,
  /\brefactor:\b/i,
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bsolo shipping\b/i,
  /\bupstream\b/i,
  /\bdev\s*(->|→)\s*main\b/i,
  /\brelease automation\b/i,
  /\bbranch protection\b/i,
  /\brelease branch synchronization\b/i,
  /\bproduct operations?\b/i,
  /\bmerge dev\b/i,
]

let failed = false

for (const doc of docs) {
  const content = readFileSync(doc.path, 'utf8')
  const head = content.split('\n').slice(0, 80).join('\n')

  if (!/Install from|Quick Start|빠른 시작/i.test(content)) {
    console.error(`✗ ${doc.name}: missing install/quick-start guidance.`)
    failed = true
  }

  if (!/VS Code extension and MCP server|VS Code 확장\s*\+\s*MCP 서버|VS Code 확장과 MCP 서버/i.test(head)) {
    console.error(`✗ ${doc.name}: opening description should state clear product value.`)
    failed = true
  }

  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const pattern of banned) {
      if (!pattern.test(line)) continue
      console.error(`✗ ${doc.name}:${i + 1}: contains developer-internal wording (${pattern}).`)
      failed = true
    }
  }
}

if (failed) {
  process.exit(1)
}

console.log('Public docs check passed for customer-facing copy.')
