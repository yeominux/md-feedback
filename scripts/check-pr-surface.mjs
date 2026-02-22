#!/usr/bin/env node
import { readFileSync } from 'fs'
import {
  COMMIT_PREFIX_PATTERNS,
  GENERIC_TITLE_PATTERNS,
  INTERNAL_WORDING_PATTERNS,
  META_COPY_PATTERNS,
  findFirstMatchingPattern,
} from './public-language-policy.mjs'

const argv = process.argv.slice(2)

function parseArg(name) {
  const idx = argv.indexOf(name)
  return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : ''
}

function getPrFromEventFile(path) {
  try {
    const payload = JSON.parse(readFileSync(path, 'utf8'))
    return {
      title: (payload?.pull_request?.title || '').trim(),
      body: (payload?.pull_request?.body || '').trim(),
    }
  } catch (err) {
    console.error(`PR surface check failed: could not parse event payload (${err.message}).`)
    process.exit(1)
  }
}

function loadPrSurface() {
  const explicitTitle = parseArg('--title')
  const explicitBody = parseArg('--body')
  const explicitBodyFile = parseArg('--body-file')
  const explicitEventFile = parseArg('--event-file')

  if (explicitTitle || explicitBody || explicitBodyFile) {
    const bodyFromFile = explicitBodyFile
      ? readFileSync(explicitBodyFile, 'utf8')
      : ''
    return {
      title: explicitTitle.trim(),
      body: (explicitBody || bodyFromFile).trim(),
      source: 'args',
    }
  }

  const eventName = process.env.GITHUB_EVENT_NAME || ''
  const eventPath = explicitEventFile || process.env.GITHUB_EVENT_PATH || ''
  if (eventName !== 'pull_request') {
    return { title: '', body: '', source: `skip:${eventName || 'unknown'}` }
  }
  if (!eventPath) {
    console.error('PR surface check failed: GITHUB_EVENT_PATH is missing.')
    process.exit(1)
  }
  const parsed = getPrFromEventFile(eventPath)
  return { ...parsed, source: 'github-event' }
}

const { title, body, source } = loadPrSurface()

const banned = [
  /\binternal\b/i,
  /\barchitecture\b/i,
  /\boperational\b/i,
  /\blocal-only\b/i,
  /\bprivate gates?\b/i,
  /\benforced\b/i,
  /\bendpoint\b/i,
  /\btoken\b/i,
  /\bsecret(?:s)?\b/i,
  /\brelease sync\b/i,
  ...INTERNAL_WORDING_PATTERNS,
  ...META_COPY_PATTERNS,
  ...COMMIT_PREFIX_PATTERNS,
]

const generic = GENERIC_TITLE_PATTERNS

function hasBad(text) {
  return findFirstMatchingPattern(text, banned)
}

if (source.startsWith('skip:')) {
  const eventName = source.replace('skip:', '')
  console.log(`PR surface check skipped (event: ${eventName || 'unknown'})`)
  process.exit(0)
}

if (!title) {
  console.error('PR surface check failed: title is empty.')
  process.exit(1)
}

const titleBan = hasBad(title)
if (titleBan) {
  console.error(`PR surface check failed: title contains internal wording (${titleBan}).`)
  console.error(`- title: ${title}`)
  process.exit(1)
}

if (findFirstMatchingPattern(title, generic)) {
  console.error('PR surface check failed: title is too generic.')
  console.error(`- title: ${title}`)
  process.exit(1)
}

if (body) {
  const bodyBan = hasBad(body)
  if (bodyBan) {
    console.error(`PR surface check failed: body contains internal wording (${bodyBan}).`)
    process.exit(1)
  }
}

console.log('PR surface check passed.')
