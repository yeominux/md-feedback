#!/usr/bin/env node

const isCi = process.env.GITHUB_ACTIONS === 'true'

function decodeBase64PatternList(value) {
  if (!value) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((encoded) => new RegExp(Buffer.from(encoded, 'base64').toString(), 'i'))
}

function readSecretPatterns(envName) {
  try {
    return decodeBase64PatternList(process.env[envName] ?? '')
  } catch (err) {
    throw new Error(`Invalid ${envName}: ${err.message}`)
  }
}

function requirePolicySecretsInCi(policy, envName) {
  const required = process.env.REQUIRE_PRIVATE_COPY_POLICY === 'true'
  if (!required || !isCi) return
  if (policy.length > 0) return
  throw new Error(
    `Missing private copy policy secret: ${envName} (required in CI when REQUIRE_PRIVATE_COPY_POLICY=true)`
  )
}

const internalSecretPatterns = readSecretPatterns('COPY_INTERNAL_PATTERNS')
const metaSecretPatterns = readSecretPatterns('COPY_META_PATTERNS')
const infraSecretPatterns = readSecretPatterns('COPY_INFRA_PATTERNS')

requirePolicySecretsInCi(internalSecretPatterns, 'COPY_INTERNAL_PATTERNS')
requirePolicySecretsInCi(metaSecretPatterns, 'COPY_META_PATTERNS')
requirePolicySecretsInCi(infraSecretPatterns, 'COPY_INFRA_PATTERNS')

export const INTERNAL_WORDING_PATTERNS = internalSecretPatterns
export const META_COPY_PATTERNS = metaSecretPatterns
export const CICD_INFRA_PATTERNS = infraSecretPatterns

export const COMMIT_PREFIX_PATTERNS = [
  /^chore(\(.+?\))?:/i,
  /^ci(\(.+?\))?:/i,
  /^feat(\(.+?\))?:/i,
  /^fix(\(.+?\))?:/i,
  /^refactor(\(.+?\))?:/i,
]

export const GENERIC_TITLE_PATTERNS = [
  /^update$/i,
  /^updates$/i,
  /^misc$/i,
  /^wip$/i,
  /^temp$/i,
  /^customer[- ]facing reliability improvement$/i,
  /^repository synchronization$/i,
  /^product release integration$/i,
  /^product quality refinement$/i,
  /^customer documentation and onboarding update$/i,
  /^new customer[- ]facing capability$/i,
  /^security hardening for customer environments$/i,
]

export function findFirstMatchingPattern(text, patterns) {
  return patterns.find((re) => re.test(text)) || null
}
