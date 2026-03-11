import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerQueryTools } from './tools-query.js'
import { registerMutationTools } from './tools-mutation.js'
import { createToolRuntime } from './tools-runtime.js'

export function registerTools(server: McpServer, workspace?: string, log?: (msg: string) => void): void {
  const runtime = createToolRuntime({ workspace, log })

  registerQueryTools(server, runtime)
  registerMutationTools(server, {
    safeRead: runtime.safeRead,
    safeWrite: runtime.safeWrite,
    wrapTool: runtime.wrapTool,
    ensureDefaultGate: runtime.ensureDefaultGate,
    updateCursorFromMemos: runtime.updateCursorFromMemos,
    applyUnifiedDiff: runtime.applyUnifiedDiff,
  })
}
