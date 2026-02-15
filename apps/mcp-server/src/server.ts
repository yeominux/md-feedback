import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTools } from './tools'

declare const __VERSION__: string

export function log(msg: string): void {
  process.stderr.write(`[md-feedback] ${msg}\n`)
}

const server = new McpServer({
  name: 'md-feedback',
  version: __VERSION__,
})

registerTools(server)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  log(`v${__VERSION__} ready (stdio)`)
}

main().catch((err) => {
  log(`fatal: ${err}`)
  process.exit(1)
})
