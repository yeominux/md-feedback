#!/usr/bin/env node
/**
 * Encodes regex source strings to comma-separated base64 values for CI secrets.
 *
 * Usage:
 *   node scripts/encode-policy-patterns.mjs "\\bdev\\s*(->|→)\\s*main\\b" "\\bbranch protection\\b"
 */

const patterns = process.argv.slice(2).map((s) => s.trim()).filter(Boolean)

if (patterns.length === 0) {
  console.error('Usage: node scripts/encode-policy-patterns.mjs "<regex1>" "<regex2>" ...')
  process.exit(1)
}

const encoded = patterns.map((p) => Buffer.from(p).toString('base64')).join(',')
console.log(encoded)
