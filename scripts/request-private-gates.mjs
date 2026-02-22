#!/usr/bin/env node
import { readFileSync } from 'fs'
import { request } from 'https'

const isCi = process.env.GITHUB_ACTIONS === 'true'
const enforced = process.env.PRIVATE_GATES_ENFORCED === 'true'
const endpoint = process.env.PRIVATE_GATES_ENDPOINT || ''
const token = process.env.PRIVATE_GATES_TOKEN || ''

function fail(message) {
  console.error(`Private gates check failed: ${message}`)
  process.exit(1)
}

if (!isCi) {
  console.log('Private gates check skipped (not running in CI).')
  process.exit(0)
}

if (!enforced) {
  console.log('Private gates check skipped (PRIVATE_GATES_ENFORCED is not true).')
  process.exit(0)
}

if (!endpoint) fail('PRIVATE_GATES_ENDPOINT is missing.')
if (!token) fail('PRIVATE_GATES_TOKEN is missing.')

let eventPayload = {}
const eventPath = process.env.GITHUB_EVENT_PATH || ''
if (eventPath) {
  try {
    eventPayload = JSON.parse(readFileSync(eventPath, 'utf8'))
  } catch {
    fail('GITHUB_EVENT_PATH payload could not be parsed.')
  }
}

const payload = JSON.stringify({
  repository: process.env.GITHUB_REPOSITORY || '',
  sha: process.env.GITHUB_SHA || '',
  ref: process.env.GITHUB_REF || '',
  eventName: process.env.GITHUB_EVENT_NAME || '',
  actor: process.env.GITHUB_ACTOR || '',
  runId: process.env.GITHUB_RUN_ID || '',
  runAttempt: process.env.GITHUB_RUN_ATTEMPT || '',
  event: eventPayload,
})

const url = new URL(endpoint)
const options = {
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: `${url.pathname}${url.search}`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    Authorization: `Bearer ${token}`,
    'User-Agent': 'md-feedback-private-gates-client',
  },
}

const client = url.protocol === 'https:' ? request : null
if (!client) fail(`Unsupported protocol: ${url.protocol}`)

const req = client(options, (res) => {
  let body = ''
  res.on('data', (chunk) => {
    body += chunk
  })
  res.on('end', () => {
    const status = res.statusCode || 0
    if (status < 200 || status >= 300) {
      fail(`private gate endpoint returned ${status}.`)
    }
    try {
      const parsed = body ? JSON.parse(body) : {}
      if (parsed.ok !== true) {
        fail('private gate endpoint returned non-ok response.')
      }
      console.log('Private gates check passed.')
    } catch {
      fail('private gate endpoint returned invalid JSON.')
    }
  })
})

req.on('error', (err) => {
  fail(`request error: ${err.message}`)
})

req.write(payload)
req.end()
