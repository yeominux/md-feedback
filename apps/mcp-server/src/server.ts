import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTools } from './tools'

declare const __VERSION__: string

export function log(msg: string): void {
  process.stderr.write(`[md-feedback] ${msg}\n`)
}

// Resolve workspace: --workspace=<path> CLI arg → MD_FEEDBACK_WORKSPACE env → cwd
function resolveWorkspace(): string | undefined {
  const wsArg = process.argv.find(a => a.startsWith('--workspace='))
  if (wsArg) return wsArg.split('=')[1]
  return process.env.MD_FEEDBACK_WORKSPACE || undefined
}

const workspace = resolveWorkspace()

const server = new McpServer({
  name: 'md-feedback',
  version: __VERSION__,
})

registerTools(server, workspace)

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
