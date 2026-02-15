#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs'

const rootPkg = JSON.parse(readFileSync('package.json', 'utf8'))
const version = rootPkg.version

const targets = [
  'apps/vscode/package.json',
  'apps/mcp-server/package.json',
  'packages/shared/package.json',
]

for (const target of targets) {
  const pkg = JSON.parse(readFileSync(target, 'utf8'))
  pkg.version = version
  writeFileSync(target, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`${target} → ${version}`)
}
