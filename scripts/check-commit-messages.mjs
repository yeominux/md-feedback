#!/usr/bin/env node
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function tryRunGit(args) {
  try {
    return runGit(args)
  } catch {
    return ''
  }
}

function parseArgRange(argv) {
  const idx = argv.indexOf('--range')
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1]
  return ''
}

function parseArgMessageFile(argv) {
  const idx = argv.indexOf('--message-file')
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1]
  return ''
}

function hasParentCommit() {
  const count = Number(tryRunGit(['rev-list', '--count', 'HEAD']) || '0')
  return Number.isFinite(count) && count > 1
}

function readGithubEvent() {
  const path = process.env.GITHUB_EVENT_PATH
  if (!path) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function detectRange(argv) {
  const explicit = parseArgRange(argv)
  if (explicit) return explicit

  const isCi = process.env.GITHUB_ACTIONS === 'true'
  if (isCi) {
    const eventName = process.env.GITHUB_EVENT_NAME || ''
    const sha = process.env.GITHUB_SHA || 'HEAD'
    const event = readGithubEvent()

    if (eventName === 'pull_request') {
      const baseRef = process.env.GITHUB_BASE_REF
      if (baseRef) {
        // Compare commits introduced by the PR head against base branch.
        return `origin/${baseRef}...${sha}`
      }
    }

    if (eventName === 'push') {
      const before = event?.before || ''
      if (before && !/^0+$/.test(before)) {
        return `${before}..${sha}`
      }
    }
  }

  if (hasParentCommit()) return 'HEAD~1..HEAD'
  return 'HEAD'
}

const bannedPatterns = [
  /\bProduct operations and release quality update\b/i,
  /\bRelease branch synchronization\b/i,
  /\bMerge dev:\b/i,
  /\bsolo shipping\b/i,
  /\bdev\s*(->|→)\s*main\b/i,
  /\brelease automation\b/i,
  /\bbranch protection\b/i,
  // Conventional commit prefixes for internal ops — not user-facing
  /^chore(\(.+?\))?:/i,
  /^ci(\(.+?\))?:/i,
  /^CI(\(.+?\))?:/,
]

const tooGenericPatterns = [
  /^update$/i,
  /^updates$/i,
  /^misc$/i,
  /^wip$/i,
  /^temp$/i,
  // Generic filler messages that say nothing about what changed
  /^customer[- ]facing reliability improvement$/i,
  /^repository synchronization$/i,
  /^product release integration$/i,
  /^product quality refinement$/i,
  /^customer documentation and onboarding update$/i,
  /^new customer[- ]facing capability$/i,
  /^security hardening for customer environments$/i,
]

const allowedMergePatterns = [
  /^Merge pull request #\d+/,
]

function validateSubject(subject, label) {
  if (!subject) return `${label}: empty subject`
  if (allowedMergePatterns.some(re => re.test(subject))) return null

  if (bannedPatterns.some(re => re.test(subject))) {
    return `${label}: "${subject}" (contains internal-operational wording)`
  }

  if (tooGenericPatterns.some(re => re.test(subject))) {
    return `${label}: "${subject}" (too generic; describe user-facing impact)`
  }

  return null
}

const argv = process.argv.slice(2)
const messageFile = parseArgMessageFile(argv)

if (messageFile) {
  const content = readFileSync(messageFile, 'utf8')
  const subject = content.split(/\r?\n/, 1)[0].trim()
  const failure = validateSubject(subject, 'commit-msg')
  if (failure) {
    console.error('Commit message check failed:')
    console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log('Commit message check passed (commit-msg hook).')
  process.exit(0)
}

const range = detectRange(argv)
let rawLog = ''
try {
  rawLog = runGit(['log', '--format=%H%x09%s', range])
} catch (err) {
  console.error('Commit message check failed: unable to read git history for range mode.')
  console.error(`- Checked range: ${range}`)
  process.exit(1)
}
const lines = rawLog.split('\n')

if (lines.length === 0) {
  console.log(`Commit message check skipped (no commits found for range: ${range}).`)
  process.exit(0)
}

const failures = []
for (const line of lines) {
  const clean = line.trim()
  if (!clean) continue
  const tab = clean.indexOf('\t')
  if (tab < 0) continue
  const hash = clean.slice(0, tab)
  const subject = clean.slice(tab + 1).trim()
  const failure = validateSubject(subject, hash.slice(0, 7))
  if (failure) failures.push(failure)
}

if (failures.length > 0) {
  console.error('Commit message check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  console.error(`Checked range: ${range}`)
  process.exit(1)
}

console.log(`Commit message check passed (${lines.length} commit(s), range: ${range}).`)
