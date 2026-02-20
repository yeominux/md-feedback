/**
 * E2E Smoke Test — Full review cycle
 *
 * Tests: create → apply → (simulate reject) → re-apply → approve
 *
 * Uses a real file at smoke/e2e-review-cycle.md so you can watch
 * VS Code update in real-time while the test runs.
 *
 * Usage:
 *   pnpm vitest run apps/mcp-server/src/e2e-smoke.test.ts
 */

import { describe, beforeEach, afterEach, expect, it } from 'vitest'
import { readFileSync, writeFileSync, copyFileSync, rmSync, existsSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { splitDocument } from '@md-feedback/shared'
import { registerTools } from './tools'

type ToolHandler = (args: Record<string, unknown>) =>
  Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>

class MockServer {
  handlers = new Map<string, ToolHandler>()
  tool(name: string, _desc: string, _schema: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler)
  }
}

function parseJson(result: { content: Array<{ text: string }> }): unknown {
  return JSON.parse(result.content[0].text)
}

describe('E2E review cycle', () => {
  const smokeFixtureDir = resolve(__dirname, '../../../smoke')
  const origFile = join(smokeFixtureDir, 'e2e-review-cycle.md')
  let workspace: string
  let testFile: string
  let server: MockServer

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'md-feedback-e2e-smoke-'))
    testFile = join(workspace, 'e2e-test-active.md')
    copyFileSync(origFile, testFile)
    server = new MockServer()
    registerTools(server as unknown as McpServer, workspace)
  })

  afterEach(() => {
    if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true })
  })

  async function call(toolName: string, args: Record<string, unknown>) {
    const handler = server.handlers.get(toolName)
    if (!handler) throw new Error(`Tool not found: ${toolName}`)
    const result = await handler(args)
    if (result.isError) {
      throw new Error(`Tool ${toolName} failed: ${result.content[0].text}`)
    }
    return parseJson(result)
  }

  function readMemos() {
    return splitDocument(readFileSync(testFile, 'utf-8')).memos
  }

  it('full cycle: create → apply → reject → re-apply → approve', async () => {
    // ── Step 1: Agent creates a Fix annotation ──
    const createResult = await call('create_annotation', {
      file: testFile,
      anchorText: 'Add client-side validation for email format and minimum password length.',
      type: 'fix',
      text: 'Client-side validation alone is not enough. Add server-side validation too.',
    }) as { memo: { id: string; status: string } }

    expect(createResult.memo.id).toBeTruthy()
    expect(createResult.memo.status).toBe('open')
    const memoId = createResult.memo.id

    // ── Step 2: Agent applies the fix (sets memo to needs_review) ──
    await call('apply_memo', {
      file: testFile,
      memoId,
      action: 'text_replace',
      oldText: 'Add client-side validation for email format and minimum password length.',
      newText: 'Add client-side and server-side validation (email regex + MX, password min 8 chars, rate limiting).',
    })

    const afterApply = readMemos()
    expect(afterApply[0].status).toBe('needs_review')

    const contentAfterApply = readFileSync(testFile, 'utf-8')
    expect(contentAfterApply).toContain('server-side validation')

    // ── Step 3: Simulate REJECT — user sets status back to open ──
    const beforeReject = readFileSync(testFile, 'utf-8')
    const rejectedContent = beforeReject.replace(
      /status="needs_review"/,
      'status="open"',
    )
    writeFileSync(testFile, rejectedContent, 'utf-8')

    const afterReject = readMemos()
    expect(afterReject[0].status).toBe('open')

    // ── Step 4: Agent re-applies after rejection ──
    await call('apply_memo', {
      file: testFile,
      memoId,
      action: 'text_replace',
      oldText: 'Add client-side and server-side validation (email regex + MX, password min 8 chars, rate limiting).',
      newText: 'Add client-side validation (email format, password min 8 chars). Server-side: validator.js for email, bcrypt for hashing, express-rate-limit for brute-force protection.',
    })

    const afterReApply = readMemos()
    expect(afterReApply[0].status).toBe('needs_review')

    const contentAfterReApply = readFileSync(testFile, 'utf-8')
    expect(contentAfterReApply).toContain('validator.js')

    // ── Step 5: Simulate APPROVE — user sets status to done ──
    const beforeApprove = readFileSync(testFile, 'utf-8')
    const approvedContent = beforeApprove.replace(
      /status="needs_review"/,
      'status="done"',
    )
    writeFileSync(testFile, approvedContent, 'utf-8')

    const afterApprove = readMemos()
    expect(afterApprove[0].status).toBe('done')

    // ── Step 6: Verify gates ──
    const gateResult = await call('evaluate_gates', {
      file: testFile,
    }) as { gates: Array<{ status: string }> }

    if (gateResult.gates.length > 0) {
      expect(gateResult.gates[0].status).toBe('done')
    }

    // ── Final ──
    const finalParts = splitDocument(readFileSync(testFile, 'utf-8'))
    expect(finalParts.memos).toHaveLength(1)
    expect(finalParts.memos[0].status).toBe('done')
    expect(readFileSync(testFile, 'utf-8')).toContain('validator.js')
  })

  it('get_review_status reflects annotation counts', async () => {
    await call('create_annotation', {
      file: testFile,
      anchorText: 'Add client-side validation for email format and minimum password length.',
      type: 'fix',
      text: 'Fix 1',
    })

    await call('create_annotation', {
      file: testFile,
      anchorText: 'Create a POST /api/login endpoint',
      type: 'question',
      text: 'What auth provider?',
    })

    const status = await call('get_review_status', {
      file: testFile,
    }) as { annotations: { fixes: number; questions: number; highlights: number } }

    expect(status.annotations.fixes).toBe(1)
    expect(status.annotations.questions).toBe(1)
  })

  it('rollback_memo reverts the last apply', async () => {
    const createResult = await call('create_annotation', {
      file: testFile,
      anchorText: 'Store the JWT token in an httpOnly cookie',
      type: 'fix',
      text: 'Use secure + SameSite flags too',
    }) as { memo: { id: string } }

    const memoId = createResult.memo.id

    await call('apply_memo', {
      file: testFile,
      memoId,
      action: 'text_replace',
      oldText: 'Store the JWT token in an httpOnly cookie',
      newText: 'Store the JWT token in a secure httpOnly SameSite=Strict cookie',
    })

    // Verify change was applied in the document text (not in HTML comments)
    const parts = splitDocument(readFileSync(testFile, 'utf-8'))
    expect(parts.body).toContain('SameSite=Strict')

    // Rollback
    await call('rollback_memo', {
      file: testFile,
      memoId,
    })

    const afterParts = splitDocument(readFileSync(testFile, 'utf-8'))
    expect(afterParts.body).toContain('Store the JWT token in an httpOnly cookie')
    expect(afterParts.body).not.toContain('SameSite=Strict')
  })

  it('question memo: respond → review → approve', async () => {
    const createResult = await call('create_annotation', {
      file: testFile,
      anchorText: 'Create a POST /api/login endpoint',
      type: 'question',
      text: 'What auth provider should we use?',
    }) as { memo: { id: string } }

    const memoId = createResult.memo.id

    // respond_to_memo works for question type
    await call('respond_to_memo', {
      file: testFile,
      memoId,
      response: 'We should use Auth0 for enterprise SSO support and Passport.js as the middleware layer.',
    })

    const afterRespond = readMemos()
    const memo = afterRespond.find(m => m.id === memoId)!
    expect(memo.status).toBe('needs_review')

    // Simulate approve
    const content = readFileSync(testFile, 'utf-8')
    writeFileSync(testFile, content.replace(
      new RegExp(`id="${memoId}"([\\s\\S]*?)status="needs_review"`),
      `id="${memoId}"$1status="done"`,
    ), 'utf-8')

    const afterApprove = readMemos()
    expect(afterApprove.find(m => m.id === memoId)!.status).toBe('done')
  })
})
