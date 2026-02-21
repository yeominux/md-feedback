#!/usr/bin/env node
import { readFileSync } from 'fs'
import { request } from 'https'

const bannedPatterns = [
  /\bsolo shipping\b/i,
  /\bupstream branch\b/i,
  /\bdev\s*(->|→)\s*main\b/i,
  /\brelease automation\b/i,
  /\bbranch protection\b/i,
  /\brelease branch synchronization\b/i,
  /\bproduct operations?\b/i,
  /\bmerge dev\b/i,
  // Meta-commentary — telling customers about internal process improvements
  /\bcustomer[- ]focused\b/i,
  /\buser[- ]facing\b/i,
  /\brelease reliability\b/i,
  /\b(rewrote|rewritten|refactored)\b.*\b(release notes?|documentation|changelog|copy)\b/i,
  /\b(release notes?|documentation|changelog|copy)\b.*\b(rewrote|rewritten|refactored)\b/i,
  // CI/CD infrastructure — not user-facing
  /\bGitHub Actions\b/i,
  /\bGitHub Releases?\s+(are|is|was|were|now)\b/i,
  /\bCI\s*\/\s*CD\b/,
  /\bCI pipeline\b/i,
]

function parseArg(name) {
  const idx = process.argv.indexOf(name)
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : ''
}

function checkText(text, label) {
  const lines = text.split('\n')
  const failures = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const re of bannedPatterns) {
      if (re.test(line)) {
        failures.push(`${label}:${i + 1}: ${line.trim()} (${re})`)
      }
    }
  }
  return failures
}

function fetchReleaseBodyByTag(repo, tag, token) {
  return new Promise((resolve, reject) => {
    const path = `/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`
    const req = request(
      {
        hostname: 'api.github.com',
        path,
        method: 'GET',
        headers: {
          'User-Agent': 'md-feedback-release-check',
          Accept: 'application/vnd.github+json',
          Authorization: token ? `Bearer ${token}` : undefined,
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(data)
              resolve(parsed.body || '')
            } catch (err) {
              reject(new Error(`Failed to parse release response: ${err.message}`))
            }
            return
          }
          reject(new Error(`GitHub API error (${res.statusCode}): ${data}`))
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

async function main() {
  const filePath = parseArg('--file')
  const tag = parseArg('--tag')

  if (!filePath && !tag) {
    console.error('Usage: node scripts/check-release-body.mjs --file <path> | --tag <vX.Y.Z>')
    process.exit(1)
  }

  let text = ''
  let label = ''
  if (filePath) {
    text = readFileSync(filePath, 'utf8')
    label = filePath
  } else {
    const repo = process.env.GITHUB_REPOSITORY || ''
    const token = process.env.GITHUB_TOKEN || ''
    if (!repo) {
      console.error('GITHUB_REPOSITORY is required when using --tag')
      process.exit(1)
    }
    text = await fetchReleaseBodyByTag(repo, tag, token)
    label = `release:${tag}`
  }

  const failures = checkText(text, label)
  if (failures.length > 0) {
    console.error('Release body check failed:')
    for (const f of failures) console.error(`- ${f}`)
    process.exit(1)
  }

  console.log(`Release body check passed (${label}).`)
}

main().catch((err) => {
  console.error(`Release body check failed: ${err.message}`)
  process.exit(1)
})
