/**
 * Tests for the HTTP/WebSocket server:
 * - REST API endpoints
 * - Path traversal protection
 * - Port increment when default port is busy
 * - document.empty includes workspace path when no .md files found
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, networkInterfaces } from 'node:os'
import { createServer } from 'node:http'
import { startHttpServer, type HttpServerHandle } from './http-server'

const SAFE_TMPDIR = (() => {
  const t = tmpdir()
  if (!/[^\x00-\x7F]/.test(t)) return t
  return process.platform === 'win32' ? 'C:\\Windows\\Temp' : '/tmp'
})()

function makeTmp(): string {
  return mkdtempSync(join(SAFE_TMPDIR, 'md-fb-http-test-'))
}

async function get(port: number, path: string): Promise<{ status: number; body: string }> {
  const { request } = await import('node:http')
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET', agent: false }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') }))
    })
    req.on('error', reject)
    req.end()
  })
}

async function post(port: number, path: string, body: string): Promise<{ status: number; body: string }> {
  const { request } = await import('node:http')
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, method: 'POST', agent: false, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') }))
      },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

describe('startHttpServer', () => {
  let workspace: string
  let handle: HttpServerHandle | null

  beforeEach(() => {
    workspace = makeTmp()
    handle = null
  })

  afterEach(async () => {
    await handle?.close()
    handle = null
    rmSync(workspace, { recursive: true, force: true })
  })

  it('starts and returns a port', async () => {
    handle = await startHttpServer({ workspace })
    expect(handle).not.toBeNull()
    expect(handle!.port).toBeGreaterThanOrEqual(4711)
    expect(handle!.port).toBeLessThanOrEqual(4720)
  })

  describe('GET /api/files', () => {
    it('returns empty list when workspace has no .md files', async () => {
      handle = await startHttpServer({ workspace })
      const { status, body } = await get(handle!.port, '/api/files')
      expect(status).toBe(200)
      expect(JSON.parse(body)).toEqual({ files: [] })
    })

    it('returns .md files in workspace', async () => {
      writeFileSync(join(workspace, 'plan.md'), '# Plan')
      writeFileSync(join(workspace, 'notes.md'), '# Notes')
      handle = await startHttpServer({ workspace })
      const { status, body } = await get(handle!.port, '/api/files')
      expect(status).toBe(200)
      const { files } = JSON.parse(body) as { files: string[] }
      expect(files).toContain('plan.md')
      expect(files).toContain('notes.md')
    })

    it('excludes node_modules from file list', async () => {
      mkdirSync(join(workspace, 'node_modules', 'pkg'), { recursive: true })
      writeFileSync(join(workspace, 'node_modules', 'pkg', 'README.md'), '# pkg')
      writeFileSync(join(workspace, 'plan.md'), '# Plan')
      handle = await startHttpServer({ workspace })
      const { body } = await get(handle!.port, '/api/files')
      const { files } = JSON.parse(body) as { files: string[] }
      expect(files).toContain('plan.md')
      expect(files.some(f => f.includes('node_modules'))).toBe(false)
    })
  })

  describe('GET /api/files/:path', () => {
    it('returns file content', async () => {
      writeFileSync(join(workspace, 'plan.md'), '# Hello')
      handle = await startHttpServer({ workspace })
      const { status, body } = await get(handle!.port, '/api/files/plan.md')
      expect(status).toBe(200)
      const parsed = JSON.parse(body) as { path: string; content: string }
      expect(parsed.content).toBe('# Hello')
      expect(parsed.path).toBe('plan.md')
    })

    it('returns 404 for missing file', async () => {
      handle = await startHttpServer({ workspace })
      const { status } = await get(handle!.port, '/api/files/missing.md')
      expect(status).toBe(404)
    })

    it('returns 403 for path traversal attempt', async () => {
      handle = await startHttpServer({ workspace })
      const { status } = await get(handle!.port, '/api/files/..%2F..%2Fetc%2Fpasswd')
      expect(status).toBe(403)
    })

    it('returns 403 for nested path traversal', async () => {
      handle = await startHttpServer({ workspace })
      const { status } = await get(handle!.port, '/api/files/subdir%2F..%2F..%2Fetc%2Fpasswd')
      expect(status).toBe(403)
    })
  })

  describe('POST /api/files/:path', () => {
    it('writes file content', async () => {
      writeFileSync(join(workspace, 'plan.md'), '# Original')
      handle = await startHttpServer({ workspace })
      const { status } = await post(handle!.port, '/api/files/plan.md', JSON.stringify({ content: '# Updated' }))
      expect(status).toBe(200)
      const { body } = await get(handle!.port, '/api/files/plan.md')
      expect(JSON.parse(body).content).toBe('# Updated')
    })

    it('returns 403 for path traversal attempt', async () => {
      handle = await startHttpServer({ workspace })
      const { status } = await post(handle!.port, '/api/files/..%2F..%2Fetc%2Fpasswd', JSON.stringify({ content: 'evil' }))
      expect(status).toBe(403)
    })

    it('returns 400 for invalid JSON body', async () => {
      writeFileSync(join(workspace, 'plan.md'), '# Plan')
      handle = await startHttpServer({ workspace })
      const { status } = await post(handle!.port, '/api/files/plan.md', 'not-json')
      expect(status).toBe(400)
    })
  })

  describe('port increment', () => {
    it('uses next port when default is busy', async () => {
      // Bind port 4711 so startHttpServer must use 4712
      const blocker = createServer()
      await new Promise<void>((res) => blocker.listen(4711, '127.0.0.1', res))
      try {
        handle = await startHttpServer({ workspace })
        expect(handle).not.toBeNull()
        expect(handle!.port).toBe(4712)
      } finally {
        await new Promise<void>((res) => blocker.close(() => res()))
      }
    })
  })
})
