#!/usr/bin/env node
import { readFileSync } from 'fs'

const releaseTag = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME || ''

if (!releaseTag.startsWith('v')) {
  console.error(`Invalid release tag: "${releaseTag}" (expected vX.Y.Z)`) 
  process.exit(1)
}

const expectedVersion = releaseTag.slice(1)
const readVersion = (filePath) => JSON.parse(readFileSync(filePath, 'utf8')).version

const files = [
  'package.json',
  'apps/vscode/package.json',
  'apps/mcp-server/package.json',
  'packages/shared/package.json',
]

const mismatches = []

for (const filePath of files) {
  const version = readVersion(filePath)
  if (version !== expectedVersion) {
    mismatches.push(`${filePath}: ${version} (expected ${expectedVersion})`)
  }
}

if (mismatches.length > 0) {
  console.error('Release version mismatch detected:')
  for (const mismatch of mismatches) {
    console.error(`- ${mismatch}`)
  }
  process.exit(1)
}

console.log(`Release versions verified for ${releaseTag}`)
