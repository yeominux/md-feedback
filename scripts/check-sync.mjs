#!/usr/bin/env node
/**
 * check-sync.mjs — Pre-release consistency checker.
 *
 * Verifies:
 *  1. Version sync across all 4 package.json files
 *  2. MCP tool count in source matches every README mention
 *  3. README section structure parity (root EN ↔ KO ↔ vscode)
 *  4. FAQ count parity across READMEs
 *  5. Export target count consistency
 *
 * Run: node scripts/check-sync.mjs
 * Exit 0 = all good, Exit 1 = problems found.
 */
import { readFileSync, readdirSync, existsSync } from 'fs'

const PASS = '\x1b[32m✓\x1b[0m'
const FAIL = '\x1b[31m✗\x1b[0m'
const WARN = '\x1b[33m!\x1b[0m'

let failures = 0
let warnings = 0

function pass(msg) { console.log(`  ${PASS} ${msg}`) }
function fail(msg) { failures++; console.log(`  ${FAIL} ${msg}`) }
function warn(msg) { warnings++; console.log(`  ${WARN} ${msg}`) }

function read(path) { return readFileSync(path, 'utf8') }

// ── 1. Version sync ──

console.log('\n\x1b[1m[1/5] Version sync\x1b[0m')

const pkgFiles = [
  'package.json',
  'apps/vscode/package.json',
  'apps/mcp-server/package.json',
  'packages/shared/package.json',
]

const versions = pkgFiles.map(f => ({
  file: f,
  version: JSON.parse(read(f)).version,
}))

const rootVersion = versions[0].version
const versionMismatches = versions.filter(v => v.version !== rootVersion)

if (versionMismatches.length === 0) {
  pass(`All 4 package.json files: ${rootVersion}`)
} else {
  fail(`Root version: ${rootVersion}`)
  for (const m of versionMismatches) {
    fail(`  ${m.file}: ${m.version}`)
  }
}

// ── 2. MCP tool count ──

console.log('\n\x1b[1m[2/5] MCP tool count\x1b[0m')

const toolFiles = readdirSync('apps/mcp-server/src')
  .filter(name => /^tools.*\.ts$/.test(name))
  .map(name => `apps/mcp-server/src/${name}`)
const toolCount = toolFiles
  .map(file => (read(file).match(/server\.tool\(/g) || []).length)
  .reduce((sum, n) => sum + n, 0)

if (toolCount === 0) {
  fail(`Could not count tools in apps/mcp-server/src/tools*.ts (${toolFiles.length} files scanned)`)
} else {
  pass(`Source: ${toolCount} tools (server.tool() calls across ${toolFiles.length} files)`)
}

const readmeFiles = [
  { path: 'README.md', label: 'README.md (GitHub EN)' },
  { path: 'README.ko.md', label: 'README.ko.md (GitHub KO)' },
  { path: 'apps/vscode/README.md', label: 'apps/vscode/README.md (Marketplace)' },
  { path: 'apps/mcp-server/README.md', label: 'apps/mcp-server/README.md (npm)' },
]

for (const { path, label } of readmeFiles) {
  const content = read(path)
  // Match patterns like "13 MCP tools", "13개 MCP 도구", "13 MCP Tools"
  const matches = content.match(/(\d+)\s*(?:개\s*)?MCP\s*(?:tools|도구|Tools)/gi) || []
  if (matches.length === 0) {
    warn(`${label}: no MCP tool count mention found`)
  } else {
    for (const match of matches) {
      const num = parseInt(match.match(/\d+/)[0], 10)
      if (num === toolCount) {
        pass(`${label}: "${match}"`)
      } else {
        fail(`${label}: says "${match}" but source has ${toolCount}`)
      }
    }
  }
}

// ── 3. README section structure ──

console.log('\n\x1b[1m[3/5] README section structure\x1b[0m')

function extractH2(content) {
  return content.split('\n')
    .filter(l => /^## /.test(l))
    .map(l => l.replace(/^## /, '').trim())
}

// Map Korean H2 headings to English equivalents for comparison
const koToEn = {
  '작동 방식': 'How It Works',
  '주요 기능': 'Features',
  '빠른 시작 (2분 이내)': 'Quick Start (under 2 minutes)',
  '사용 사례': 'Use Cases',
  '설계 철학': 'Design Philosophy',
  'VS Code 설정': 'VS Code Settings',
  'MCP 서버': 'MCP Server',
  '패키지': 'Packages',
  '링크': 'Links',
  '라이선스': 'License',
  'FAQ': 'FAQ',
}

const rootH2 = extractH2(read('README.md'))
const koH2 = extractH2(read('README.ko.md'))
const vscodeH2 = extractH2(read('apps/vscode/README.md'))

// Root EN ↔ KO
const koH2Translated = koH2.map(h => koToEn[h] || h)
if (JSON.stringify(rootH2) === JSON.stringify(koH2Translated)) {
  pass(`README.md ↔ README.ko.md: ${rootH2.length} sections match`)
} else {
  fail('README.md ↔ README.ko.md: section mismatch')
  const onlyRoot = rootH2.filter(h => !koH2Translated.includes(h))
  const onlyKo = koH2Translated.filter(h => !rootH2.includes(h))
  if (onlyRoot.length) fail(`  Only in EN: ${onlyRoot.join(', ')}`)
  if (onlyKo.length) fail(`  Only in KO: ${onlyKo.join(', ')}`)
}

// Root EN ↔ VS Code
if (JSON.stringify(rootH2) === JSON.stringify(vscodeH2)) {
  pass(`README.md ↔ apps/vscode/README.md: ${rootH2.length} sections match`)
} else {
  const onlyRoot = rootH2.filter(h => !vscodeH2.includes(h))
  const onlyVscode = vscodeH2.filter(h => !rootH2.includes(h))
  if (onlyRoot.length === 0 && onlyVscode.length === 0) {
    // Same sections, different order
    warn('README.md ↔ apps/vscode/README.md: same sections but different order')
  } else {
    fail('README.md ↔ apps/vscode/README.md: section mismatch')
    if (onlyRoot.length) fail(`  Only in root: ${onlyRoot.join(', ')}`)
    if (onlyVscode.length) fail(`  Only in vscode: ${onlyVscode.join(', ')}`)
  }
}

// ── 4. FAQ count ──

console.log('\n\x1b[1m[4/5] FAQ count\x1b[0m')

function countFAQ(content) {
  // Count bold question lines like **What is...?**
  return (content.match(/^\*\*[^*]+\?\*\*$/gm) || []).length
}

const rootFAQ = countFAQ(read('README.md'))
const koFAQ = countFAQ(read('README.ko.md'))
const vscodeFAQ = countFAQ(read('apps/vscode/README.md'))

pass(`README.md: ${rootFAQ} FAQ entries`)

if (koFAQ === rootFAQ) {
  pass(`README.ko.md: ${koFAQ} FAQ entries (matches root)`)
} else {
  fail(`README.ko.md: ${koFAQ} FAQ entries (root has ${rootFAQ})`)
}

if (vscodeFAQ === rootFAQ) {
  pass(`apps/vscode/README.md: ${vscodeFAQ} FAQ entries (matches root)`)
} else {
  fail(`apps/vscode/README.md: ${vscodeFAQ} FAQ entries (root has ${rootFAQ})`)
}

// ── 5. Agent instruction file sync ──

console.log('\n\x1b[1m[5/7] Agent instruction sync\x1b[0m')

const agentSource = 'CLAUDE.md'
const agentTargets = [
  { path: 'AGENTS.md', label: 'AGENTS.md (Codex/universal)' },
  { path: '.github/copilot-instructions.md', label: '.github/copilot-instructions.md (Copilot)' },
  { path: '.cursorrules', label: '.cursorrules (Cursor)' },
]

if (!existsSync(agentSource)) {
  // CLAUDE.md is in .gitignore — skip in CI
  console.log(`  (skipped — ${agentSource} not present, e.g. CI environment)`)
} else {
  const sourceContent = read(agentSource)
  for (const { path: targetPath, label } of agentTargets) {
    if (!existsSync(targetPath)) { warn(`${label}: file not found`); continue }
    const targetContent = read(targetPath)
    if (targetContent === sourceContent) {
      pass(`${label}: in sync with CLAUDE.md`)
    } else {
      fail(`${label}: out of sync with CLAUDE.md — run "pnpm sync:agents"`)
    }
  }
}

// ── 6. Export target count ──

console.log('\n\x1b[1m[6/7] Export target count\x1b[0m')

for (const { path, label } of readmeFiles) {
  const content = read(path)
  // Match "Export to N AI tools" or "N개 AI 도구로 내보내기"
  const exportMatch = content.match(/(?:Export to |)(\d+)\+?\s*(?:개\s*)?AI\s*(?:tools|도구)/i)
  if (exportMatch) {
    const num = parseInt(exportMatch[1], 10)
    pass(`${label}: export to ${num} AI tools`)
  }
}

// ── 7. README version tags ──

console.log('\n\x1b[1m[7/7] README version tags\x1b[0m')

const readmeVersionFiles = [
  { path: 'README.md', label: 'README.md (GitHub EN)' },
  { path: 'README.ko.md', label: 'README.ko.md (GitHub KO)' },
  { path: 'apps/vscode/README.md', label: 'apps/vscode/README.md (Marketplace)' },
]

for (const { path, label } of readmeVersionFiles) {
  const content = read(path)
  // Match "> Latest (vX.Y.Z):" or "> 최신(vX.Y.Z):"
  const versionMatch = content.match(/>\s*(?:Latest|최신)\s*\(v([\d.]+)\)/)
  if (!versionMatch) {
    warn(`${label}: no version tag found`)
  } else {
    const readmeVersion = versionMatch[1]
    if (readmeVersion === rootVersion) {
      pass(`${label}: v${readmeVersion}`)
    } else {
      fail(`${label}: says v${readmeVersion} but package.json has ${rootVersion}`)
    }
  }
}

// ── Summary ──

console.log('')
if (failures === 0 && warnings === 0) {
  console.log('\x1b[32m\x1b[1mAll checks passed.\x1b[0m\n')
} else if (failures === 0) {
  console.log(`\x1b[33m\x1b[1m${warnings} warning(s), 0 failures.\x1b[0m\n`)
} else {
  console.log(`\x1b[31m\x1b[1m${failures} failure(s), ${warnings} warning(s).\x1b[0m\n`)
  process.exit(1)
}
