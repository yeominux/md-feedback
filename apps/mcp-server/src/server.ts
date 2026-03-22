import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTools } from './tools'
import { listWorkspaceDocuments, resolveWorkspaceFrom } from './workspace'
import { startHttpServer } from './http-server'

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
  const markdownFiles = listWorkspaceDocuments(wsLabel, { annotatedOnly: false, maxFiles: 200 })
  if (markdownFiles.length === 0) {
    log(`warning: no markdown files found in workspace=${wsLabel}. create/open a .md file to use annotation tools.`)
  }
  log(`v${__VERSION__} ready (stdio) workspace=${wsLabel}`)

  // Determine host from --host flag
  const hostArg = process.argv.find(a => a.startsWith('--host='))
  const host = hostArg ? hostArg.slice('--host='.length) : '127.0.0.1'

  // Start HTTP + WebSocket server
  try {
    const handle = await startHttpServer({ workspace: wsLabel, host })
    if (handle) {
      log(`web UI ready at http://${host}:${handle.port}`)

      // Open browser unless --no-ui flag is present
      const noUi = process.argv.includes('--no-ui')
      if (!noUi) {
        try {
          const open = (await import('open')).default
          await open(`http://${host}:${handle.port}`)
        } catch {
          log('warning: could not open browser (headless environment?)')
        }
      }
    }
  } catch (err) {
    log(`warning: failed to start web UI: ${err}`)
  }
}

main().catch((err) => {
  log(`fatal: ${err}`)
  process.exit(1)
})
