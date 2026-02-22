#!/usr/bin/env node
/**
 * Sets required GitHub repository secrets for private gate mode.
 *
 * Usage:
 *   node scripts/setup-private-gates-secrets.mjs \
 *     --repo yeominux/md-feedback \
 *     --endpoint https://private-gate.example.com/check \
 *     --token your_token_here \
 *     --enforced true
 */
import { execFileSync } from 'child_process'

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(name)
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]
  return fallback
}

const repo = arg('--repo', process.env.GITHUB_REPOSITORY || '')
const endpoint = arg('--endpoint')
const token = arg('--token')
const enforced = arg('--enforced', 'true')

if (!repo) {
  console.error('Missing --repo (e.g. yeominux/md-feedback)')
  process.exit(1)
}
if (!endpoint) {
  console.error('Missing --endpoint')
  process.exit(1)
}
if (!token) {
  console.error('Missing --token')
  process.exit(1)
}

function setSecret(name, value) {
  execFileSync(
    'gh',
    ['secret', 'set', name, '--repo', repo, '--body', value],
    { stdio: 'inherit' }
  )
}

setSecret('PRIVATE_GATES_ENDPOINT', endpoint)
setSecret('PRIVATE_GATES_TOKEN', token)
setSecret('PRIVATE_GATES_ENFORCED', enforced)

console.log('Private gate secrets configured.')
