#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function run(cmd, cwd) {
  execSync(cmd, { stdio: 'inherit', cwd, env: process.env })
}

const root = JSON.parse(readFileSync('package.json', 'utf8'))
const version = root.version
const cwd = 'apps/vscode'
const vsix = `md-feedback-vscode-${version}.vsix`

run('pnpm.cmd --filter md-feedback-vscode package', '.')
run(`npx.cmd ovsx publish ${vsix}`, cwd)
