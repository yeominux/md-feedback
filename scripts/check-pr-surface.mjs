#!/usr/bin/env node
import { readFileSync } from 'fs'

const eventName = process.env.GITHUB_EVENT_NAME || ''
const eventPath = process.env.GITHUB_EVENT_PATH || ''

if (eventName !== 'pull_request') {
  console.log(`PR surface check skipped (event: ${eventName || 'unknown'})`)
  process.exit(0)
}

if (!eventPath) {
  console.error('PR surface check failed: GITHUB_EVENT_PATH is missing.')
  process.exit(1)
}

let payload
try {
  payload = JSON.parse(readFileSync(eventPath, 'utf8'))
} catch (err) {
  console.error(`PR surface check failed: could not parse event payload (${err.message}).`)
  process.exit(1)
}

const title = (payload?.pull_request?.title || '').trim()
const body = (payload?.pull_request?.body || '').trim()

const banned = [
  /\bdev\s*(->|→)\s*main\b/i,
  /\brelease sync\b/i,
  /\bmerge dev\b/i,
  /\binternal\b/i,
  /\barchitecture\b/i,
  /\boperational\b/i,
  /\blocal-only\b/i,
  /^chore(\(.+?\))?:/i,
  /^ci(\(.+?\))?:/i,
]

const generic = [
  /^update$/i,
  /^misc$/i,
  /^wip$/i,
  /^temp$/i,
]

function hasBad(text) {
  return banned.find(re => re.test(text)) || null
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

if (generic.some(re => re.test(title))) {
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
