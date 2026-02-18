#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs'

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const sectionRe = /^## \[(.+?)\] - (\d{4}-\d{2}-\d{2})$/gm
const first = sectionRe.exec(changelog)

if (!first) {
  console.error('No release section found in CHANGELOG.md')
  process.exit(1)
}

const next = sectionRe.exec(changelog)
const start = first.index
const end = next ? next.index : changelog.length
const section = changelog.slice(start, end).trim()

const outputFlagIndex = process.argv.indexOf('--output')
const outputPath = outputFlagIndex >= 0 ? process.argv[outputFlagIndex + 1] : null

if (outputPath) {
  if (!outputPath.startsWith('-')) {
    writeFileSync(outputPath, section + '\n', 'utf8')
    console.error(`Wrote release notes to ${outputPath}`)
  } else {
    console.error('Invalid --output value')
    process.exit(1)
  }
} else {
  console.log(section)
}
