#!/usr/bin/env node
/**
 * Release automation — single command for everything except publish.
 *
 * Usage:
 *   pnpm release 0.9.7          # explicit version
 *   pnpm release patch           # 0.9.6 → 0.9.7
 *   pnpm release minor           # 0.9.6 → 0.10.0
 *   pnpm release major           # 0.9.6 → 1.0.0
 *
 * What it does:
 *   1. Enforces clean + synced release state on dev branch
 *   2. Bumps version in all package.json files
 *   3. Validates CHANGELOG has an entry for this version
 *   4. Runs tests (abort on failure)
 *   5. Runs build (abort on failure)
 *   6. Git add -A + commit + tag (no release-file omissions)
 *   7. Git push + push tags
 *   8. Prints publish instructions
 *
 * What it does NOT do:
 *   - npm publish
 *   - vsce publish
 *   - ovsx publish
 *   → These are manual. Run: pnpm publish:npm / publish:vsce / publish:ovsx
 */

import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'

// ── Helpers ──

function run(cmd, opts = {}) {
  console.log(`\n  → ${cmd}`)
  try {
    return execSync(cmd, { stdio: 'inherit', encoding: 'utf8', ...opts })
  } catch (err) {
    console.error(`\n  ✗ Command failed: ${cmd}`)
    process.exit(1)
  }
}

function runQuiet(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim()
}

function hasUpstream() {
  try {
    runQuiet('git rev-parse --abbrev-ref --symbolic-full-name @{u}')
    return true
  } catch {
    return false
  }
}

function getCurrentBranch() {
  return runQuiet('git rev-parse --abbrev-ref HEAD')
}

function parseChangedPathsFromPorcelain(status) {
  if (!status) return []
  return status
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(3))
    .map((path) => (path.includes(' -> ') ? path.split(' -> ')[1] : path))
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n')
}

function bumpVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number)
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  if (type === 'major') return `${major + 1}.0.0`
  return null
}

// ── Main ──

const arg = process.argv[2]
if (!arg) {
  console.error('Usage: pnpm release <version|patch|minor|major>')
  process.exit(1)
}

const pkgFiles = [
  'package.json',
  'apps/vscode/package.json',
  'apps/mcp-server/package.json',
  'packages/shared/package.json',
]

const currentVersion = readJson('package.json').version
let nextVersion

if (/^\d+\.\d+\.\d+$/.test(arg)) {
  nextVersion = arg
} else if (['patch', 'minor', 'major'].includes(arg)) {
  nextVersion = bumpVersion(currentVersion, arg)
} else {
  console.error(`Invalid version: "${arg}". Use X.Y.Z or patch/minor/major.`)
  process.exit(1)
}

console.log(`\n╔══════════════════════════════════════╗`)
console.log(`║  MD Feedback Release: ${currentVersion} → ${nextVersion}`)
console.log(`╚══════════════════════════════════════╝`)

// Step 1: Enforce clean + synced release state
console.log('\n── Step 1/7: Check working tree ──')
const branch = getCurrentBranch()
if (branch !== 'dev') {
  console.error(`  ✗ Releases must run from dev branch (current: ${branch})`)
  process.exit(1)
}

run('git fetch origin --tags')

const status = runQuiet('git status --porcelain')
const changedPaths = parseChangedPathsFromPorcelain(status)
const blockedPaths = ['.githooks/pre-commit']
const blockedChanges = changedPaths.filter((path) => blockedPaths.includes(path))

if (blockedChanges.length > 0) {
  console.error('  ✗ Local-only files are changed and blocked from release flow:')
  for (const path of blockedChanges) {
    console.error(`    - ${path}`)
  }
  console.error('  → Revert/commit these separately, then run release again.')
  process.exit(1)
}

if (status) {
  console.error('  ✗ Working tree must be clean before release.')
  console.error('    Commit or stash changes first, then run release again.')
  process.exit(1)
}

const aheadBehind = runQuiet('git rev-list --left-right --count HEAD...origin/dev').split(/\s+/).map(Number)
const [ahead, behind] = aheadBehind
if (ahead !== 0 || behind !== 0) {
  console.error(`  ✗ Branch must be exactly synced with origin/dev (ahead=${ahead}, behind=${behind}).`)
  console.error('    Run: git pull --rebase origin dev')
  process.exit(1)
}

// Step 2: Bump version in all package.json files
console.log('\n── Step 2/7: Bump version ──')
for (const file of pkgFiles) {
  const pkg = readJson(file)
  pkg.version = nextVersion
  writeJson(file, pkg)
  console.log(`  ✓ ${file} → ${nextVersion}`)
}

// Step 3: Validate CHANGELOG
console.log('\n── Step 3/7: Validate CHANGELOG ──')
const changelog = readFileSync('CHANGELOG.md', 'utf8')
if (!changelog.includes(`[${nextVersion}]`)) {
  console.error(`  ✗ CHANGELOG.md has no entry for [${nextVersion}].`)
  console.error(`  → Add a "## [${nextVersion}] - YYYY-MM-DD" section before releasing.`)
  // Revert version changes
  for (const file of pkgFiles) {
    const pkg = readJson(file)
    pkg.version = currentVersion
    writeJson(file, pkg)
  }
  process.exit(1)
}
console.log(`  ✓ Found [${nextVersion}] in CHANGELOG.md`)
run('node scripts/check-public-docs.mjs')
run('node scripts/check-changelog-user-facing.mjs')

// Step 4: Run tests
console.log('\n── Step 4/7: Run tests ──')
run('pnpm test')
console.log('  ✓ All tests passed')

// Step 5: Run build
console.log('\n── Step 5/7: Build ──')
run('pnpm -r build')
console.log('  ✓ Build successful')

// Step 6: Git commit + tag
console.log('\n── Step 6/7: Git commit + tag ──')
run('git add -A')
run(`git commit -m "v${nextVersion}"`)
run(`git tag v${nextVersion}`)
console.log(`  ✓ Committed and tagged v${nextVersion}`)

// Step 7: Git push
console.log('\n── Step 7/7: Git push ──')
if (hasUpstream()) {
  run('git push')
} else {
  run(`git push -u origin ${getCurrentBranch()}`)
}
run('git push --tags')
console.log(`  ✓ Pushed to remote`)

// Done — print publish instructions
console.log(`
╔═══════════════════════════════════════════════════════════╗
║  ✓ Release v${nextVersion} — pushed to remote${' '.repeat(Math.max(0, 33 - nextVersion.length))}║
║                                                           ║
║  GitHub Actions CI + VSIX packaging in progress...        ║
║  https://github.com/yeominux/md-feedback/actions          ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  Publish manually (3 commands):                           ║
║                                                           ║
║  ① npm (MCP server):                                      ║
║     cd apps/mcp-server && npm publish                     ║
║                                                           ║
║  ② VS Code Marketplace:                                   ║
║     cd apps/vscode                                        ║
║     npx @vscode/vsce publish --packagePath \\              ║
║       md-feedback-vscode-${nextVersion}.vsix${' '.repeat(Math.max(0, 28 - nextVersion.length))}║
║                                                           ║
║  ③ Open VSX:                                              ║
║     cd apps/vscode                                        ║
║     npx ovsx publish md-feedback-vscode-${nextVersion}.vsix${' '.repeat(Math.max(0, 12 - nextVersion.length))}║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║  Verify:                                                  ║
║     npx -y md-feedback --version  → ${nextVersion}${' '.repeat(Math.max(0, 22 - nextVersion.length))}║
║                                                           ║
║  If tokens expired:                                       ║
║  • vsce: https://dev.azure.com → Renew PAT               ║
║         npx @vscode/vsce login yeominux                   ║
║  • ovsx: https://open-vsx.org → Access Tokens             ║
║         npx ovsx create-namespace yeominux                ║
╚═══════════════════════════════════════════════════════════╝
`)

// Also build the VSIX so it's ready for manual publish
console.log('── Building VSIX for publish... ──')
try {
  run('pnpm --filter md-feedback-vscode package')
  console.log(`  ✓ VSIX ready: apps/vscode/md-feedback-vscode-${nextVersion}.vsix\n`)
} catch {
  console.log('  ⚠ VSIX build failed — run "pnpm --filter md-feedback-vscode package" manually\n')
}
