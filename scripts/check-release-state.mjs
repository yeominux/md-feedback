#!/usr/bin/env node
import { execSync } from 'child_process'

function runQuiet(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim()
}

try {
  execSync('git fetch origin --tags', { stdio: 'inherit' })

  const branch = runQuiet('git rev-parse --abbrev-ref HEAD')
  if (branch !== 'dev') {
    console.error(`Release checks must run on dev branch (current: ${branch}).`)
    process.exit(1)
  }

  const status = runQuiet('git status --porcelain')
  if (status) {
    console.error('Working tree must be clean before release checks.')
    process.exit(1)
  }

  const [ahead, behind] = runQuiet('git rev-list --left-right --count HEAD...origin/dev')
    .split(/\s+/)
    .map(Number)

  if (ahead !== 0 || behind !== 0) {
    console.error(`Branch must be synced with origin/dev (ahead=${ahead}, behind=${behind}).`)
    process.exit(1)
  }

  console.log('Release git-state check passed (clean dev, synced with origin/dev).')
} catch (err) {
  console.error('Release git-state check failed.')
  process.exit(1)
}
