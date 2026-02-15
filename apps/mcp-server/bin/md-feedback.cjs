#!/usr/bin/env node

const arg = process.argv[2]
if (arg === '--help' || arg === '-h') {
  console.log('md-feedback - MCP server for markdown annotation review\n')
  console.log('Usage: md-feedback              Start MCP server (stdio transport)')
  console.log('       md-feedback --version    Print version')
  console.log('       md-feedback --help       Show this help\n')
  console.log('Configure in your AI tool\'s MCP settings:')
  console.log('  { "command": "npx", "args": ["-y", "md-feedback"] }')
  process.exit(0)
}
if (arg === '--version' || arg === '-v') {
  const pkg = require('../package.json')
  console.log(pkg.version)
  process.exit(0)
}

require('../dist/mcp-server.js')
