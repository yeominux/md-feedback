#!/usr/bin/env node

export const INTERNAL_WORDING_PATTERNS = [
  /\bsolo shipping\b/i,
  /\bupstream(?: branch)?\b/i,
  /\bdev\s*(->|→)\s*main\b/i,
  /\brelease automation\b/i,
  /\bbranch protection\b/i,
  /\brelease branch synchronization\b/i,
  /\bproduct operations?\b/i,
  /\bmerge dev\b/i,
  /\binternal\b/i,
  /\barchitecture\b/i,
  /\boperational\b/i,
  /\blocal-only\b/i,
]

export const META_COPY_PATTERNS = [
  /\bcustomer[- ]focused\b/i,
  /\buser[- ]facing\b/i,
  /\brelease reliability\b/i,
  /\b(rewrote|rewritten|refactored)\b.*\b(release notes?|documentation|changelog|copy)\b/i,
  /\b(release notes?|documentation|changelog|copy)\b.*\b(rewrote|rewritten|refactored)\b/i,
]

export const CICD_INFRA_PATTERNS = [
  /\bGitHub Actions\b/i,
  /\bGitHub Releases?\s+(are|is|was|were|now)\b/i,
  /\bCI\s*\/\s*CD\b/i,
  /\bCI pipeline\b/i,
  /\bauto[- ]?render\b/i,
]

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

