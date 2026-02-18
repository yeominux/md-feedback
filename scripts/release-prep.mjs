#!/usr/bin/env node
import { execSync } from 'child_process'
import { readFileSync } from 'fs'

function run(cmd, env = {}) {
  console.log(`\n→ ${cmd}`)
  execSync(cmd, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
}

const rootPkg = JSON.parse(readFileSync('package.json', 'utf8'))
const version = rootPkg.version
const releaseTag = `v${version}`

console.log(`Preparing release checks for ${releaseTag}`)

run('node scripts/check-sync.mjs')
run('node scripts/check-public-docs.mjs')
run('node scripts/check-changelog-customer.mjs')
run('node scripts/guard-public-surface.mjs')
run('node scripts/verify-release.mjs', { RELEASE_TAG: releaseTag })
run('pnpm -r build')
run('pnpm test')
run('pnpm --filter md-feedback-vscode package')

console.log(`\nRelease prep complete for ${releaseTag}`)
