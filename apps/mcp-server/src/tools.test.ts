import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { splitDocument } from '@md-feedback/shared'
import { registerTools } from './tools'

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>

class MockServer {
  handlers = new Map<string, ToolHandler>()

  tool(name: string, _description: string, _schema: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler)
  }
}

function parseJson(result: { content: Array<{ text: string }> }): unknown {
  return JSON.parse(result.content[0].text)
}

describe('mcp-server tools', () => {
  let workspace: string
  let server: MockServer

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'md-feedback-tools-test-'))
    server = new MockServer()
    registerTools(server as unknown as McpServer, workspace)
  })

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  it('create_annotation creates memo + default gate + cursor', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor line\n', 'utf-8')

    const handler = server.handlers.get('create_annotation')
    expect(handler).toBeDefined()

    const result = await handler!({
      file,
      anchorText: 'Anchor line',
      type: 'fix',
      text: 'Need to fix this',
    })

    expect(result.isError).toBeUndefined()
    const body = parseJson(result) as { memo: { id: string } }
    expect(body.memo.id).toContain('memo-')

    const updated = readFileSync(file, 'utf-8')
    const parts = splitDocument(updated)
    expect(parts.memos).toHaveLength(1)
    expect(parts.gates).toHaveLength(1)
    expect(parts.cursor?.taskId).toBe(parts.memos[0].id)
  })

  it('create_annotation returns structured error when anchor is missing', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nOnly this line\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const result = await createAnnotation({
      file,
      anchorText: 'Missing anchor',
      type: 'fix',
      text: 'Need to fix this',
    })

    expect(result.isError).toBe(true)
    expect(parseJson(result)).toMatchObject({
      code: 'ANCHOR_NOT_FOUND',
      type: 'AnchorNotFoundError',
      details: { anchorText: 'Missing anchor', matchCount: 0 },
    })
  })

  it('respond_to_memo inserts response and sets status to needs_review', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor line\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const createResult = await createAnnotation({
      file,
      anchorText: 'Anchor line',
      type: 'question',
      text: 'Question memo',
    })
    const created = parseJson(createResult) as { memo: { id: string } }

    const respondToMemo = server.handlers.get('respond_to_memo')!
    const respondResult = await respondToMemo({
      file,
      memoId: created.memo.id,
      response: 'Handled by AI response',
    })

    expect(respondResult.isError).toBeUndefined()
    const updated = readFileSync(file, 'utf-8')
    const parts = splitDocument(updated)
    const memo = parts.memos.find(m => m.id === created.memo.id)
    expect(memo?.status).toBe('needs_review')
    expect(parts.responses.some(r => r.to === created.memo.id)).toBe(true)
    expect(parts.body).toContain('Handled by AI response')
  })

  it('apply_memo file_patch applies unified diff to target file', async () => {
    const file = join(workspace, 'review.md')
    const targetFile = join(workspace, 'target.txt')
    writeFileSync(file, '# Title\nAnchor line\n', 'utf-8')
    writeFileSync(targetFile, 'alpha\nbeta\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const createResult = await createAnnotation({
      file,
      anchorText: 'Anchor line',
      type: 'fix',
      text: 'Patch target file',
    })
    const created = parseJson(createResult) as { memo: { id: string } }

    const applyMemo = server.handlers.get('apply_memo')!
    const patch = [
      '--- a/target.txt',
      '+++ b/target.txt',
      '@@ -1,2 +1,2 @@',
      ' alpha',
      '-beta',
      '+BETA',
    ].join('\n')

    const applyResult = await applyMemo({
      file,
      memoId: created.memo.id,
      action: 'file_patch',
      targetFile,
      patch,
    })

    expect(applyResult.isError).toBeUndefined()
    expect(readFileSync(targetFile, 'utf-8')).toBe('alpha\nBETA\n')
  })

  it('apply_memo returns OPERATION_INVALID when required params are missing', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor line\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const created = parseJson(await createAnnotation({
      file,
      anchorText: 'Anchor line',
      type: 'fix',
      text: 'Patch target file',
    })) as { memo: { id: string } }

    const applyMemo = server.handlers.get('apply_memo')!
    const result = await applyMemo({
      file,
      memoId: created.memo.id,
      action: 'file_patch',
      targetFile: join(workspace, 'target.txt'),
      // patch missing on purpose
    })

    expect(result.isError).toBe(true)
    expect(parseJson(result)).toMatchObject({
      code: 'OPERATION_INVALID',
      type: 'OperationValidationError',
      details: { memoId: created.memo.id, action: 'file_patch' },
    })
  })

  it('batch_apply is atomic when an operation fails', async () => {
    const file = join(workspace, 'review.md')
    const targetFile = join(workspace, 'target.txt')
    const missingFile = join(workspace, 'missing.txt')
    writeFileSync(file, '# Title\nAnchor one\nAnchor two\n', 'utf-8')
    writeFileSync(targetFile, 'alpha\nbeta\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const first = parseJson(await createAnnotation({
      file,
      anchorText: 'Anchor one',
      type: 'fix',
      text: 'First memo',
    })) as { memo: { id: string } }
    const second = parseJson(await createAnnotation({
      file,
      anchorText: 'Anchor two',
      type: 'fix',
      text: 'Second memo',
    })) as { memo: { id: string } }

    const beforeDoc = readFileSync(file, 'utf-8')
    const beforeTarget = readFileSync(targetFile, 'utf-8')
    const batchApply = server.handlers.get('batch_apply')!

    const okPatch = [
      '--- a/target.txt',
      '+++ b/target.txt',
      '@@ -1,2 +1,2 @@',
      ' alpha',
      '-beta',
      '+BETA',
    ].join('\n')

    const result = await batchApply({
      file,
      operations: [
        { memoId: first.memo.id, action: 'file_patch', targetFile, patch: okPatch },
        { memoId: second.memo.id, action: 'file_patch', targetFile: missingFile, patch: okPatch },
      ],
    })

    expect(result.isError).toBe(true)
    expect(parseJson(result)).toMatchObject({ code: 'OPERATION_INVALID', type: 'OperationValidationError' })
    expect(readFileSync(targetFile, 'utf-8')).toBe(beforeTarget)
    expect(readFileSync(file, 'utf-8')).toBe(beforeDoc)
  })

  it('update_memo_progress preserves all entries under concurrent calls', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor line\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const created = parseJson(await createAnnotation({
      file,
      anchorText: 'Anchor line',
      type: 'fix',
      text: 'Track progress',
    })) as { memo: { id: string } }

    const updateMemoProgress = server.handlers.get('update_memo_progress')!
    const [r1, r2] = await Promise.all([
      updateMemoProgress({
        file,
        memoId: created.memo.id,
        status: 'in_progress',
        message: 'step-1',
      }),
      updateMemoProgress({
        file,
        memoId: created.memo.id,
        status: 'needs_review',
        message: 'step-2',
      }),
    ])

    expect(r1.isError).toBeUndefined()
    expect(r2.isError).toBeUndefined()

    const progressPath = join(workspace, '.md-feedback', 'progress.json')
    const entries = JSON.parse(readFileSync(progressPath, 'utf-8')) as Array<{ message: string }>
    const messages = new Set(entries.map(e => e.message))
    expect(messages.has('step-1')).toBe(true)
    expect(messages.has('step-2')).toBe(true)
  })

  it('update_memo_status creates default gate and updates cursor progress', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor line\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const created = parseJson(await createAnnotation({
      file,
      anchorText: 'Anchor line',
      type: 'fix',
      text: 'Status target',
    })) as { memo: { id: string } }

    const updateMemoStatus = server.handlers.get('update_memo_status')!
    const result = await updateMemoStatus({
      file,
      memoId: created.memo.id,
      status: 'in_progress',
      owner: 'agent',
    })

    expect(result.isError).toBeUndefined()
    const updated = readFileSync(file, 'utf-8')
    const parts = splitDocument(updated)
    expect(parts.gates.length).toBeGreaterThan(0)
    expect(parts.cursor?.taskId).toBe(created.memo.id)
    expect(parts.cursor?.step).toContain('/1 resolved')
  })

  it('update_cursor returns error for unknown taskId when memos exist', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor line\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    await createAnnotation({
      file,
      anchorText: 'Anchor line',
      type: 'question',
      text: 'Has memo',
    })

    const updateCursor = server.handlers.get('update_cursor')!
    const result = await updateCursor({
      file,
      taskId: 'non-existent-task',
      step: '1/1',
      nextAction: 'Do something',
    })

    expect(result.isError).toBe(true)
    expect(parseJson(result)).toMatchObject({
      code: 'OPERATION_INVALID',
      type: 'OperationValidationError',
      error: expect.stringContaining('Task ID not found'),
    })
  })

  it('pickup_handoff returns structured error for invalid handoff file', async () => {
    const file = join(workspace, 'handoff.md')
    writeFileSync(file, '# Not a handoff\njust text\n', 'utf-8')

    const pickupHandoff = server.handlers.get('pickup_handoff')!
    const result = await pickupHandoff({ file })

    expect(result.isError).toBe(true)
    expect(parseJson(result)).toMatchObject({
      code: 'HANDOFF_INVALID',
      type: 'InvalidHandoffError',
      error: 'Not a valid handoff document',
    })
  })

  it('rollback_memo reverts latest text_replace implementation', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor line\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const created = parseJson(await createAnnotation({
      file,
      anchorText: 'Anchor line',
      type: 'fix',
      text: 'Rollback target',
    })) as { memo: { id: string } }

    const applyMemo = server.handlers.get('apply_memo')!
    const applyResult = await applyMemo({
      file,
      memoId: created.memo.id,
      action: 'text_replace',
      oldText: 'Anchor line',
      newText: 'Updated line',
    })
    expect(applyResult.isError).toBeUndefined()
    expect(readFileSync(file, 'utf-8')).toContain('Updated line')

    const rollbackMemo = server.handlers.get('rollback_memo')!
    const rollbackResult = await rollbackMemo({
      file,
      memoId: created.memo.id,
    })
    expect(rollbackResult.isError).toBeUndefined()

    const rolledBack = splitDocument(readFileSync(file, 'utf-8'))
    expect(rolledBack.body).toContain('Anchor line')
    expect(rolledBack.body).not.toContain('Updated line')
    expect(rolledBack.impls[rolledBack.impls.length - 1]?.status).toBe('reverted')
  })

  it('respond_to_memo returns MEMO_NOT_FOUND when memo does not exist', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor line\n', 'utf-8')

    const respondToMemo = server.handlers.get('respond_to_memo')!
    const result = await respondToMemo({
      file,
      memoId: 'memo-does-not-exist',
      response: 'response',
    })

    expect(result.isError).toBe(true)
    expect(parseJson(result)).toMatchObject({
      code: 'MEMO_NOT_FOUND',
      type: 'MemoNotFoundError',
      details: { memoId: 'memo-does-not-exist' },
    })
  })

  it('get_document_structure returns summary counts and sections', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\n## Section A\nAnchor one\n## Section B\nAnchor two\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const first = parseJson(await createAnnotation({
      file,
      anchorText: 'Anchor one',
      type: 'fix',
      text: 'First fix',
    })) as { memo: { id: string } }
    await createAnnotation({
      file,
      anchorText: 'Anchor two',
      type: 'question',
      text: 'Second question',
    })

    const updateMemoStatus = server.handlers.get('update_memo_status')!
    await updateMemoStatus({
      file,
      memoId: first.memo.id,
      status: 'in_progress',
    })

    const getDocumentStructure = server.handlers.get('get_document_structure')!
    const result = await getDocumentStructure({ file })
    expect(result.isError).toBeUndefined()
    const body = parseJson(result) as {
      summary: { total: number; inProgress: number; questions: number; fixes: number }
      sections: { all: string[]; reviewed: string[] }
    }

    expect(body.summary.total).toBe(2)
    expect(body.summary.inProgress).toBe(1)
    expect(body.summary.fixes).toBe(1)
    expect(body.summary.questions).toBe(1)
    expect(body.sections.all).toContain('Section A')
    expect(body.sections.all).toContain('Section B')
    expect(body.sections.reviewed).toContain('Section A')
    expect(body.sections.reviewed).toContain('Section B')
  })

  it('export_review with handoff target returns handoff markdown', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\n## Section A\nAnchor line\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    await createAnnotation({
      file,
      anchorText: 'Anchor line',
      type: 'fix',
      text: 'Need update',
    })

    const exportReview = server.handlers.get('export_review')!
    const result = await exportReview({
      file,
      target: 'handoff',
    })

    expect(result.isError).toBeUndefined()
    const markdown = result.content[0].text
    expect(markdown).toContain('# HANDOFF')
    expect(markdown).toContain('## Session')
    expect(markdown).toContain('## Decisions Made')
  })
})
