#!/usr/bin/env node
/**
 * Private Gate Service Template (run in a private repo/infrastructure)
 *
 * Exposes:
 *   POST /check
 * Request:
 *   Authorization: Bearer <PRIVATE_GATES_TOKEN>
 *   JSON payload from scripts/request-private-gates.mjs
 * Response:
 *   { ok: true } or { ok: false, reasons: string[] }
 *
 * Environment:
 *   PRIVATE_GATES_TOKEN=<token>
 *   INTERNAL_PATTERNS_B64=<comma-separated base64 regex sources>
 *   META_PATTERNS_B64=<comma-separated base64 regex sources>
 *   INFRA_PATTERNS_B64=<comma-separated base64 regex sources>
 *   PORT=8787
 */
import { createServer } from 'http'

const token = process.env.PRIVATE_GATES_TOKEN || ''
const port = Number(process.env.PORT || '8787')

if (!token) {
  console.error('PRIVATE_GATES_TOKEN is required.')
  process.exit(1)
}

function decodePatterns(raw) {
  return (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((encoded) => new RegExp(Buffer.from(encoded, 'base64').toString(), 'i'))
}

const internalPatterns = decodePatterns(process.env.INTERNAL_PATTERNS_B64)
const metaPatterns = decodePatterns(process.env.META_PATTERNS_B64)
const infraPatterns = decodePatterns(process.env.INFRA_PATTERNS_B64)
const allPatterns = [...internalPatterns, ...metaPatterns, ...infraPatterns]

function collectTextCandidates(payload) {
  const out = []
  const event = payload?.event || {}
  const pr = event?.pull_request || {}
  if (typeof pr.title === 'string') out.push(`pr.title:${pr.title}`)
  if (typeof pr.body === 'string') out.push(`pr.body:${pr.body}`)

  const headCommit = event?.head_commit || {}
  if (typeof headCommit.message === 'string') {
    const subject = headCommit.message.split(/\r?\n/, 1)[0]?.trim() || ''
    if (subject) out.push(`head_commit.subject:${subject}`)
  }

  // Push payload may include multiple commits
  const commits = Array.isArray(event?.commits) ? event.commits : []
  for (const c of commits) {
    if (typeof c?.message !== 'string') continue
    const subject = c.message.split(/\r?\n/, 1)[0]?.trim() || ''
    if (subject) out.push(`commit.subject:${subject}`)
  }

  return out
}

function evaluate(payload) {
  if (allPatterns.length === 0) {
    return { ok: false, reasons: ['No private patterns configured.'] }
  }

  const texts = collectTextCandidates(payload)
  const reasons = []
  for (const taggedText of texts) {
    for (const re of allPatterns) {
      if (re.test(taggedText)) {
        reasons.push(`${taggedText} matched ${re}`)
      }
    }
  }

  if (reasons.length > 0) return { ok: false, reasons }
  return { ok: true }
}

const server = createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/check') {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, reasons: ['Not found'] }))
    return
  }

  const auth = req.headers.authorization || ''
  if (auth !== `Bearer ${token}`) {
    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, reasons: ['Unauthorized'] }))
    return
  }

  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', () => {
    let payload = {}
    try {
      payload = body ? JSON.parse(body) : {}
    } catch {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, reasons: ['Invalid JSON'] }))
      return
    }

    const result = evaluate(payload)
    res.statusCode = result.ok ? 200 : 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(result))
  })
})

server.listen(port, () => {
  console.log(`Private gate service listening on :${port}`)
})
