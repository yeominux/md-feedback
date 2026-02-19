import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTools } from './tools'
import { resolveWorkspaceFrom } from './workspace'

declare const __VERSION__: string

export function log(msg: string): void {
  process.stderr.write(`[md-feedback] ${msg}\n`)
}

function resolveWorkspace(): string | undefined {
  return resolveWorkspaceFrom(process.argv, process.env)
}

const workspace = resolveWorkspace()

const server = new McpServer({
  name: 'md-feedback',
  version: __VERSION__,
})

registerTools(server, workspace, log)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  const wsLabel = workspace || process.cwd()
  log(`v${__VERSION__} ready (stdio) workspace=${wsLabel}`)
}

main().catch((err) => {
  log(`fatal: ${err}`)
  process.exit(1)
})
