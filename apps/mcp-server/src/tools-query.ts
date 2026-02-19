import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { QueryToolContext } from './tools-runtime.js'
import { registerDocumentQueryTools } from './tools-query-document.js'
import { registerExportQueryTools } from './tools-query-export.js'

export function registerQueryTools(server: McpServer, ctx: QueryToolContext): void {
  registerDocumentQueryTools(server, ctx)
  registerExportQueryTools(server, ctx)
}
