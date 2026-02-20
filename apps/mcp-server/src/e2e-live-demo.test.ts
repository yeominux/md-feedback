/**
 * E2E Live Demo — shows file content at each step
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

function step(n: number, title: string) {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  Step ${n}: ${title}`)
  console.log('═'.repeat(60))
}

function showStatus(file: string) {
  const parts = splitDocument(readFileSync(file, 'utf-8'))
  console.log(`\n  📊 메모 ${parts.memos.length}개:`)
  for (const m of parts.memos) {
    console.log(`     [${m.type}] status=${m.status} | "${m.text.slice(0, 50)}"`)
  }
  if (parts.gates.length > 0) {
    console.log(`  🚦 게이트: ${parts.gates.map(g => g.status).join(', ')}`)
  }
  if (parts.impls.length > 0) {
    console.log(`  🔧 구현: ${parts.impls.length}개 (${parts.impls.map(i => i.status).join(', ')})`)
  }
}

describe('E2E Live Demo', () => {
  const smokeFixtureDir = resolve(__dirname, '../../../smoke')
  const origFile = join(smokeFixtureDir, 'e2e-review-cycle.md')
  let workspace: string
  let testFile: string
  let server: MockServer

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'md-feedback-e2e-live-'))
    testFile = join(workspace, 'e2e-live-demo.md')
    copyFileSync(origFile, testFile)
    server = new MockServer()
    registerTools(server as unknown as McpServer, workspace)
  })

  afterEach(() => {
    if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true })
  })

  async function call(toolName: string, args: Record<string, unknown>) {
    const handler = server.handlers.get(toolName)!
    const result = await handler(args)
    if (result.isError) throw new Error(`${toolName}: ${result.content[0].text}`)
    return parseJson(result)
  }

  it('reject → re-implement → approve 전체 사이클', async () => {
    step(1, 'Agent가 Fix 어노테이션 생성')
    const { memo } = await call('create_annotation', {
      file: testFile,
      anchorText: 'Add client-side validation for email format and minimum password length.',
      type: 'fix',
      text: 'Client-side validation alone is not enough. Add server-side validation too.',
    }) as { memo: { id: string } }
    console.log(`  → 메모 생성됨: ${memo.id}`)
    showStatus(testFile)

    step(2, 'Agent가 수정 적용 (apply_memo)')
    await call('apply_memo', {
      file: testFile,
      memoId: memo.id,
      action: 'text_replace',
      oldText: 'Add client-side validation for email format and minimum password length.',
      newText: 'Add client-side and server-side validation (email regex, password min 8 chars, rate limiting).',
    })
    console.log('  → 텍스트 변경 + 상태 needs_review로 전환')
    showStatus(testFile)

    step(3, '사용자가 Reject (상태를 open으로 되돌림)')
    const content = readFileSync(testFile, 'utf-8')
    writeFileSync(testFile, content.replace(/status="needs_review"/, 'status="open"'), 'utf-8')
    console.log('  → 사용자: "이 방식 말고 validator.js 쓰세요"')
    showStatus(testFile)

    step(4, 'Agent가 재구현 (두번째 apply_memo)')
    await call('apply_memo', {
      file: testFile,
      memoId: memo.id,
      action: 'text_replace',
      oldText: 'Add client-side and server-side validation (email regex, password min 8 chars, rate limiting).',
      newText: 'Client-side: email format + password min 8 chars. Server-side: validator.js, bcrypt, express-rate-limit.',
    })
    console.log('  → 재구현 완료, 다시 needs_review')
    showStatus(testFile)

    step(5, '사용자가 Approve (상태를 done으로)')
    const content2 = readFileSync(testFile, 'utf-8')
    writeFileSync(testFile, content2.replace(/status="needs_review"/, 'status="done"'), 'utf-8')
    showStatus(testFile)

    step(6, '게이트 평가')
    const gates = await call('evaluate_gates', { file: testFile }) as { gates: Array<{ status: string }> }
    console.log(`  → 게이트 상태: ${gates.gates[0]?.status ?? 'none'}`)
    showStatus(testFile)

    // Assertions
    const final = splitDocument(readFileSync(testFile, 'utf-8'))
    expect(final.memos[0].status).toBe('done')
    expect(gates.gates[0].status).toBe('done')
    expect(readFileSync(testFile, 'utf-8')).toContain('validator.js')

    console.log('\n  🎉 전체 사이클 성공: 생성 → 적용 → Reject → 재구현 → Approve → Gate Done')
  })
})
