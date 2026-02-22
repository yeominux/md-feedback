#!/usr/bin/env node
import { readFileSync } from 'fs'
import {
  CICD_INFRA_PATTERNS,
  INTERNAL_WORDING_PATTERNS,
  META_COPY_PATTERNS,
} from './public-language-policy.mjs'

const changelog = readFileSync('CHANGELOG.md', 'utf8')

const versionHeaderRe = /^## \[(.+?)\] - (\d{4}-\d{2}-\d{2})$/gm
const sections = []
let match

while ((match = versionHeaderRe.exec(changelog)) !== null) {
  sections.push({
    version: match[1],
    index: match.index,
    headerEnd: versionHeaderRe.lastIndex,
  })
}

if (sections.length === 0) {
  console.error('CHANGELOG check failed: no version sections found.')
  process.exit(1)
}

const failures = []

const bannedTechnicalTerms = [
  /\b[A-Za-z0-9_-]+\.tsx\b/i,
  /\b[A-Za-z0-9_-]+\.ts\b/i,
  /\b[A-Za-z0-9_-]+\.mjs\b/i,
  /\bget[A-Z][A-Za-z0-9]*\(/,
  /\bset[A-Z][A-Za-z0-9]*\(/,
  /\brefactor\b/i,
  /\bchore:\b/i,
  /\bfeat:\b/i,
  /\bfix:\b/i,
  /\bsync-controller\b/i,
  /\bApp\.tsx\b/i,
  ...CICD_INFRA_PATTERNS,
]

const bannedInternalOpsTerms = [...INTERNAL_WORDING_PATTERNS, ...META_COPY_PATTERNS]

function findBodyLineNumber(changelogText, sectionHeaderEnd, matchIndexInBody) {
  const absoluteIndex = sectionHeaderEnd + matchIndexInBody
  return changelogText.slice(0, absoluteIndex).split('\n').length
}

for (let i = 0; i < sections.length; i++) {
  const current = sections[i]
  const next = sections[i + 1]
  const body = changelog
    .slice(current.headerEnd, next ? next.index : changelog.length)
    .trim()

  if (!body) {
    failures.push(`[${current.version}] has no content.`)
    continue
  }

  const hasUserSection = /### (Added|Fixed|Improved|Changed)\b/.test(body)
  if (!hasUserSection) {
    failures.push(
      `[${current.version}] should use user-facing sections (Added/Fixed/Improved/Changed).`
    )
  }

  const bullets = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))

  if (bullets.length === 0) {
    failures.push(`[${current.version}] should include at least one bullet point.`)
  }

  for (const re of bannedInternalOpsTerms) {
    const matchInBody = body.search(re)
    if (matchInBody >= 0) {
      const lineNo = findBodyLineNumber(changelog, current.headerEnd, matchInBody)
      failures.push(
        `[${current.version}] line ${lineNo}: contains internal/private wording (${re}).`
      )
    }
  }

  for (const bullet of bullets) {
    if (bannedTechnicalTerms.some((re) => re.test(bullet))) {
      failures.push(
        `[${current.version}] contains developer-internal wording: "${bullet}"`
      )
    }
  }
}

if (failures.length > 0) {
  console.error('CHANGELOG user-facing language check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(`CHANGELOG user-facing language check passed (${sections.length} versions).`)
