import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync, writeFileSync, watch } from 'node:fs'
import { join, resolve } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { listWorkspaceDocuments, SKIP_DIRS } from './workspace'
import { log } from './logger'

const PORT_START = 4711
const PORT_MAX = 4720

function tryBindPort(port: number, host: string): Promise<ReturnType<typeof createServer> | null> {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(null)
      } else {
        log(`web UI: port ${port} error: ${err.code ?? err.message}`)
        resolve(null)
      }
    })
    srv.once('listening', () => resolve(srv))
    srv.listen(port, host)
  })
}

async function findAvailablePort(host: string): Promise<{ server: ReturnType<typeof createServer>; port: number } | null> {
  for (let port = PORT_START; port <= PORT_MAX; port++) {
    const server = await tryBindPort(port, host)
    if (server) {
      if (port !== PORT_START) {
        log(`web UI: port ${PORT_START} in use → using ${port}`)
      }
      return { server, port }
    }
  }
  return null
}

function setCors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  setCors(res)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function getBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

export interface HttpServerOptions {
  workspace: string
  host?: string
  /** Path to the built webview static files (index.html etc.) */
  staticDir?: string
}

export interface HttpServerHandle {
  port: number
  close(): Promise<void>
}

export async function startHttpServer(opts: HttpServerOptions): Promise<HttpServerHandle | null> {
  const workspace = resolve(opts.workspace)
  const host = opts.host ?? '127.0.0.1'

  const found = await findAvailablePort(host)
  if (!found) {
    log('web UI: no available port in range 4711-4720, skipping')
    return null
  }

  const { server, port } = found

  // WebSocket server on same HTTP server
  const wss = new WebSocketServer({ server })
  const clients = new Set<WebSocket>()

  /** Send the first .md file in workspace as document.load, or document.empty */
  function sendInitialDocument(ws: WebSocket) {
    const files = listWorkspaceDocuments(workspace, { annotatedOnly: false, maxFiles: 500 })
    if (files.length === 0) {
      try { ws.send(JSON.stringify({ type: 'document.empty', workspace })) } catch { /* closed */ }
      return
    }
    const rel = files[0]
    const abs = join(workspace, rel)
    try {
      const content = readFileSync(abs, 'utf-8')
      try {
        ws.send(JSON.stringify({
          type: 'document.load',
          content,
          cleanContent: content,
          highlightMarks: [],
          filePath: rel,
          impls: [],
        }))
      } catch { /* ws closed between read and send */ }
    } catch {
      try { ws.send(JSON.stringify({ type: 'document.empty', workspace })) } catch { /* closed */ }
    }
  }

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws)
    ws.on('close', () => clients.delete(ws))
    ws.on('error', () => clients.delete(ws))

    // Send initial document when client connects or signals ready
    sendInitialDocument(ws)

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; path?: string }
        // Re-send document when webview signals it is ready (e.g. after hot reload)
        if (msg.type === 'webview.ready') {
          sendInitialDocument(ws)
          return
        }
        // Client requests a specific file
        if (msg.type === 'document.open' && msg.path) {
          const abs = join(workspace, msg.path)
          if (abs.startsWith(workspace + '/') || abs === workspace) {
            try {
              const content = readFileSync(abs, 'utf-8')
              ws.send(JSON.stringify({
                type: 'document.load',
                content,
                cleanContent: content,
                highlightMarks: [],
                filePath: msg.path,
                impls: [],
              }))
            } catch { /* file not found */ }
          }
        }
      } catch { /* ignore non-JSON */ }
    })
  })

  function broadcast(msg: unknown) {
    const text = JSON.stringify(msg)
    for (const ws of clients) {
      try { ws.send(text) } catch { /* skip closed */ }
    }
  }

  // File watcher
  const watchers: ReturnType<typeof watch>[] = []
  try {
    const watcher = watch(workspace, { recursive: true }, (_event, filename) => {
      if (!filename) return
      // Skip SKIP_DIRS
      const parts = filename.split(/[\\/]/)
      if (parts.some(p => SKIP_DIRS.has(p))) return
      if (!filename.toLowerCase().endsWith('.md')) return
      broadcast({ type: 'file:changed', path: filename.replace(/\\/g, '/') })
    })
    // Absorb async permission errors (e.g. restricted subdirs in workspace)
    watcher.on('error', () => { /* non-fatal */ })
    watchers.push(watcher)
  } catch {
    log('web UI: file watcher unavailable')
  }

  server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET'
    const rawUrl = req.url ?? '/'

    // CORS preflight
    if (method === 'OPTIONS') {
      setCors(res)
      res.writeHead(204)
      res.end()
      return
    }

    // Strip query string
    const urlPath = rawUrl.split('?')[0]

    // API: GET /api/files
    if (method === 'GET' && urlPath === '/api/files') {
      const files = listWorkspaceDocuments(workspace, { annotatedOnly: false, maxFiles: 500 })
      sendJson(res, 200, { files })
      return
    }

    // API: GET /api/files/*
    if (method === 'GET' && urlPath.startsWith('/api/files/')) {
      const rel = decodeURIComponent(urlPath.slice('/api/files/'.length))
      const abs = join(workspace, rel)
      // Safety: must stay inside workspace
      if (!abs.startsWith(workspace + '/') && abs !== workspace) {
        sendJson(res, 403, { error: 'Forbidden' })
        return
      }
      try {
        const content = readFileSync(abs, 'utf-8')
        sendJson(res, 200, { path: rel, content })
      } catch {
        sendJson(res, 404, { error: 'Not found' })
      }
      return
    }

    // API: POST /api/files/*
    if (method === 'POST' && urlPath.startsWith('/api/files/')) {
      const rel = decodeURIComponent(urlPath.slice('/api/files/'.length))
      const abs = join(workspace, rel)
      if (!abs.startsWith(workspace + '/') && abs !== workspace) {
        sendJson(res, 403, { error: 'Forbidden' })
        return
      }
      try {
        const body = await getBody(req)
        const { content } = JSON.parse(body) as { content: string }
        if (typeof content !== 'string') {
          sendJson(res, 400, { error: 'content must be a string' })
          return
        }
        writeFileSync(abs, content, 'utf-8')
        sendJson(res, 200, { ok: true })
      } catch (err) {
        sendJson(res, 400, { error: String(err) })
      }
      return
    }

    // Static file serving
    if (opts.staticDir) {
      let filePath = urlPath === '/' ? '/index.html' : urlPath
      const abs = join(opts.staticDir, filePath)
      // Safety: stay inside staticDir
      const safeStatic = resolve(opts.staticDir)
      const safeAbs = resolve(abs)
      if (!safeAbs.startsWith(safeStatic)) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }
      try {
        const content = readFileSync(safeAbs)
        const ext = filePath.split('.').pop() ?? ''
        const mimeMap: Record<string, string> = {
          html: 'text/html',
          js: 'application/javascript',
          css: 'text/css',
          svg: 'image/svg+xml',
          png: 'image/png',
          ico: 'image/x-icon',
          json: 'application/json',
          woff: 'font/woff',
          woff2: 'font/woff2',
        }
        const mime = mimeMap[ext] ?? 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': mime })
        res.end(content)
        return
      } catch {
        // Fall through to SPA fallback
        try {
          const index = readFileSync(join(opts.staticDir, 'index.html'))
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(index)
          return
        } catch {
          // No static files at all
        }
      }
    }

    res.writeHead(404)
    res.end('Not found')
  })

  return {
    port,
    close(): Promise<void> {
      for (const w of watchers) { try { w.close() } catch { /* ignore */ } }
      wss.close()
      server.closeAllConnections()
      return new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
