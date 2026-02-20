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
    delete process.env.MD_FEEDBACK_WORKFLOW_ENFORCEMENT
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

  it('respond_to_memo preserves highlight marks when memo was recovered from HIGHLIGHT_MARK', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(
      file,
      '# Title\nAnchor line\n<!-- HIGHLIGHT_MARK color="#93c5fd" text="Anchor line" anchor="Anchor line" -->\n',
      'utf-8',
    )

    const getDocumentStructure = server.handlers.get('get_document_structure')!
    const structure = parseJson(await getDocumentStructure({ file })) as { memos: Array<{ id: string; source: string }> }
    const recovered = structure.memos.find(m => m.source === 'recovered-highlight')
    expect(recovered).toBeDefined()

    const respondToMemo = server.handlers.get('respond_to_memo')!
    const respondResult = await respondToMemo({
      file,
      memoId: recovered!.id,
      response: 'AI answer on recovered memo',
    })

    expect(respondResult.isError).toBeUndefined()
    const updated = readFileSync(file, 'utf-8')
    expect(updated).toContain('<!-- HIGHLIGHT_MARK color="#93c5fd" text="Anchor line" anchor="Anchor line" -->')
    expect(updated).toContain('<!-- REVIEW_RESPONSE to="')
    expect(updated).toContain('AI answer on recovered memo')
  })

  it('respond_to_memo keeps explicit memo + highlight mark visible after reply', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(
      file,
      `# Title
Anchor line
<!-- USER_MEMO
  id="q1"
  type="question"
  status="open"
  owner="human"
  source="generic"
  color="blue"
  text="Need clarification"
  anchorText="Anchor line"
  anchor="L2|placeholder"
  createdAt="2026-01-01T00:00:00.000Z"
  updatedAt="2026-01-01T00:00:00.000Z"
-->
<!-- HIGHLIGHT_MARK color="#93c5fd" text="Anchor line" anchor="Anchor line" -->
`,
      'utf-8',
    )

    const respondToMemo = server.handlers.get('respond_to_memo')!
    const respondResult = await respondToMemo({
      file,
      memoId: 'q1',
      response: 'Added answer for review',
    })

    expect(respondResult.isError).toBeUndefined()
    const updated = readFileSync(file, 'utf-8')
    const parts = splitDocument(updated)
    const memo = parts.memos.find(m => m.id === 'q1')

    expect(updated).toContain('<!-- HIGHLIGHT_MARK color="#93c5fd" text="Anchor line" anchor="Anchor line" -->')
    expect(updated).toContain('<!-- REVIEW_RESPONSE to="q1" -->')
    expect(parts.responses.some(r => r.to === 'q1')).toBe(true)
    expect(memo?.status).toBe('needs_review')
  })

  it('respond_to_memo rejects fix memos to enforce apply_memo workflow', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor line\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const createResult = await createAnnotation({
      file,
      anchorText: 'Anchor line',
      type: 'fix',
      text: 'Must be implemented, not answered',
    })
    const created = parseJson(createResult) as { memo: { id: string } }

    const respondToMemo = server.handlers.get('respond_to_memo')!
    const result = await respondToMemo({
      file,
      memoId: created.memo.id,
      response: 'I only explained it',
    })

    expect(result.isError).toBe(true)
    expect(parseJson(result)).toMatchObject({
      code: 'OPERATION_INVALID',
      type: 'OperationValidationError',
      details: { memoId: created.memo.id, memoType: 'fix' },
    })
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

  it('apply_memo text_replace replaces first occurrence by default', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor line\nAnchor line\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const created = parseJson(await createAnnotation({
      file,
      anchorText: 'Anchor line',
      type: 'fix',
      text: 'Replace one occurrence',
    })) as { memo: { id: string } }

    const applyMemo = server.handlers.get('apply_memo')!
    const result = await applyMemo({
      file,
      memoId: created.memo.id,
      action: 'text_replace',
      oldText: 'Anchor line',
      newText: 'Updated line',
    })

    expect(result.isError).toBeUndefined()
    const updated = splitDocument(readFileSync(file, 'utf-8'))
    expect(updated.body.match(/Updated line/g)?.length ?? 0).toBe(1)
    expect(updated.body.match(/Anchor line/g)?.length ?? 0).toBe(1)
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

  it('apply_memo rejects question memos to enforce respond_to_memo workflow', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor line\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const created = parseJson(await createAnnotation({
      file,
      anchorText: 'Anchor line',
      type: 'question',
      text: 'Need clarification',
    })) as { memo: { id: string } }

    const applyMemo = server.handlers.get('apply_memo')!
    const result = await applyMemo({
      file,
      memoId: created.memo.id,
      action: 'text_replace',
      oldText: 'Anchor line',
      newText: 'Updated line',
    })

    expect(result.isError).toBe(true)
    expect(parseJson(result)).toMatchObject({
      code: 'OPERATION_INVALID',
      type: 'OperationValidationError',
      details: { memoId: created.memo.id, memoType: 'question' },
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

  it('batch_apply rejects non-fix memo operations', async () => {
    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor one\nAnchor two\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const fixMemo = parseJson(await createAnnotation({
      file,
      anchorText: 'Anchor one',
      type: 'fix',
      text: 'Fix path',
    })) as { memo: { id: string } }
    const questionMemo = parseJson(await createAnnotation({
      file,
      anchorText: 'Anchor two',
      type: 'question',
      text: 'Question path',
    })) as { memo: { id: string } }

    const before = readFileSync(file, 'utf-8')
    const batchApply = server.handlers.get('batch_apply')!
    const result = await batchApply({
      file,
      operations: [
        {
          memoId: fixMemo.memo.id,
          action: 'text_replace',
          oldText: 'Anchor one',
          newText: 'Updated one',
        },
        {
          memoId: questionMemo.memo.id,
          action: 'text_replace',
          oldText: 'Anchor two',
          newText: 'Updated two',
        },
      ],
    })

    expect(result.isError).toBe(true)
    expect(parseJson(result)).toMatchObject({
      code: 'OPERATION_INVALID',
      type: 'OperationValidationError',
      details: { memoId: questionMemo.memo.id, memoType: 'question', action: 'batch_apply' },
    })
    expect(readFileSync(file, 'utf-8')).toBe(before)
  })

  it('get_policy_status returns active profile and memo action rules', async () => {
    const getPolicyStatus = server.handlers.get('get_policy_status')!
    const result = await getPolicyStatus({})

    expect(result.isError).toBeUndefined()
    expect(parseJson(result)).toMatchObject({
      policy: {
        profile: expect.any(String),
        memoActions: {
          respond_to_memo: { allowedMemoTypes: ['question'] },
          apply_memo: { allowedMemoTypes: ['fix'] },
          batch_apply: { allowedMemoTypes: ['fix'] },
        },
      },
    })
  })

  it('strict workflow mode blocks implementation tools before phase transition', async () => {
    process.env.MD_FEEDBACK_WORKFLOW_ENFORCEMENT = 'strict'

    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor line\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const created = parseJson(await createAnnotation({
      file,
      anchorText: 'Anchor line',
      type: 'fix',
      text: 'Needs implementation',
    })) as { memo: { id: string } }

    const applyMemo = server.handlers.get('apply_memo')!
    const blocked = await applyMemo({
      file,
      memoId: created.memo.id,
      action: 'text_replace',
      oldText: 'Anchor line',
      newText: 'Updated line',
    })

    expect(blocked.isError).toBe(true)
    expect(parseJson(blocked)).toMatchObject({
      code: 'OPERATION_INVALID',
      details: {
        tool: 'apply_memo',
        currentPhase: 'scope',
        allowedPhases: ['implementation'],
      },
    })
  })

  it('strict workflow mode allows apply_memo after sequential phase advancement', async () => {
    process.env.MD_FEEDBACK_WORKFLOW_ENFORCEMENT = 'strict'

    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor line\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const created = parseJson(await createAnnotation({
      file,
      anchorText: 'Anchor line',
      type: 'fix',
      text: 'Needs implementation',
    })) as { memo: { id: string } }

    const advance = server.handlers.get('advance_workflow_phase')!
    const step1 = await advance({ file, toPhase: 'root_cause', note: 'debugged root cause' })
    const step2 = await advance({ file, toPhase: 'implementation', note: 'ready to implement' })
    expect(step1.isError).toBeUndefined()
    expect(step2.isError).toBeUndefined()

    const applyMemo = server.handlers.get('apply_memo')!
    const result = await applyMemo({
      file,
      memoId: created.memo.id,
      action: 'text_replace',
      oldText: 'Anchor line',
      newText: 'Updated line',
    })

    expect(result.isError).toBeUndefined()
    expect(readFileSync(file, 'utf-8')).toContain('Updated line')

    const getWorkflowStatus = server.handlers.get('get_workflow_status')!
    const workflowBody = parseJson(await getWorkflowStatus({ file })) as {
      workflow: { phase: string; transitions: Array<{ from: string; to: string }> }
    }
    expect(workflowBody.workflow.phase).toBe('implementation')
    expect(workflowBody.workflow.transitions).toEqual([
      { from: 'scope', to: 'root_cause', tool: 'advance_workflow_phase', note: 'debugged root cause', timestamp: expect.any(String) },
      { from: 'root_cause', to: 'implementation', tool: 'advance_workflow_phase', note: 'ready to implement', timestamp: expect.any(String) },
    ])
  })

  it('strict workflow mode blocks transition to verification with unresolved blocking memo', async () => {
    process.env.MD_FEEDBACK_WORKFLOW_ENFORCEMENT = 'strict'

    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor line\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    await createAnnotation({
      file,
      anchorText: 'Anchor line',
      type: 'fix',
      text: 'Blocking memo',
    })

    const advance = server.handlers.get('advance_workflow_phase')!
    expect((await advance({ file, toPhase: 'root_cause' })).isError).toBeUndefined()
    expect((await advance({ file, toPhase: 'implementation' })).isError).toBeUndefined()

    const blocked = await advance({ file, toPhase: 'verification' })
    expect(blocked.isError).toBe(true)
    expect(parseJson(blocked)).toMatchObject({
      code: 'OPERATION_INVALID',
      details: {
        requestedPhase: 'verification',
        unresolvedBlockingMemos: [expect.any(String)],
      },
    })
  })

  it('strict workflow mode allows verification transition when blocking memo is downgraded', async () => {
    process.env.MD_FEEDBACK_WORKFLOW_ENFORCEMENT = 'strict'

    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor line\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const created = parseJson(await createAnnotation({
      file,
      anchorText: 'Anchor line',
      type: 'fix',
      text: 'Initially blocking',
    })) as { memo: { id: string } }

    const setSeverity = server.handlers.get('set_memo_severity')!
    const severityResult = await setSeverity({
      file,
      memoId: created.memo.id,
      severity: 'non_blocking',
    })
    expect(severityResult.isError).toBeUndefined()

    const advance = server.handlers.get('advance_workflow_phase')!
    expect((await advance({ file, toPhase: 'root_cause' })).isError).toBeUndefined()
    expect((await advance({ file, toPhase: 'implementation' })).isError).toBeUndefined()
    const toVerification = await advance({ file, toPhase: 'verification' })
    expect(toVerification.isError).toBeUndefined()

    const getSeverityStatus = server.handlers.get('get_severity_status')!
    const severityBody = parseJson(await getSeverityStatus({ file })) as {
      severity: { overrides: Record<string, string>; unresolvedBlockingMemos: string[] }
    }
    expect(severityBody.severity.overrides[created.memo.id]).toBe('non_blocking')
    expect(severityBody.severity.unresolvedBlockingMemos).toEqual([])
  })

  it('strict HITL blocks high-risk batch_apply until approved and consumes approval grant', async () => {
    process.env.MD_FEEDBACK_WORKFLOW_ENFORCEMENT = 'strict'

    const file = join(workspace, 'review.md')
    writeFileSync(file, '# Title\nAnchor one\n', 'utf-8')

    const createAnnotation = server.handlers.get('create_annotation')!
    const created = parseJson(await createAnnotation({
      file,
      anchorText: 'Anchor one',
      type: 'fix',
      text: 'Batch change',
    })) as { memo: { id: string } }

    const setSeverity = server.handlers.get('set_memo_severity')!
    await setSeverity({ file, memoId: created.memo.id, severity: 'non_blocking' })

    const advance = server.handlers.get('advance_workflow_phase')!
    await advance({ file, toPhase: 'root_cause' })
    await advance({ file, toPhase: 'implementation' })

    const batchApply = server.handlers.get('batch_apply')!
    const blocked = await batchApply({
      file,
      operations: [
        {
          memoId: created.memo.id,
          action: 'text_replace',
          oldText: 'Anchor one',
          newText: 'Anchor updated',
        },
      ],
    })
    expect(blocked.isError).toBe(true)
    expect(parseJson(blocked)).toMatchObject({
      code: 'OPERATION_INVALID',
      error: expect.stringContaining('Approval required'),
      details: { tool: 'batch_apply' },
    })

    const approve = server.handlers.get('approve_checkpoint')!
    const approved = await approve({
      file,
      tool: 'batch_apply',
      approvedBy: 'human-reviewer',
      reason: 'Approved for controlled batch change',
    })
    expect(approved.isError).toBeUndefined()

    const allowedOnce = await batchApply({
      file,
      operations: [
        {
          memoId: created.memo.id,
          action: 'text_replace',
          oldText: 'Anchor one',
          newText: 'Anchor updated',
        },
      ],
    })
    expect(allowedOnce.isError).toBeUndefined()

    const blockedAgain = await batchApply({
      file,
      operations: [
        {
          memoId: created.memo.id,
          action: 'text_replace',
          oldText: 'Anchor updated',
          newText: 'Anchor final',
        },
      ],
    })
    expect(blockedAgain.isError).toBe(true)
    expect(parseJson(blockedAgain)).toMatchObject({
      code: 'OPERATION_INVALID',
      details: { tool: 'batch_apply' },
    })
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

  it('list_documents returns markdown files and supports annotatedOnly filter', async () => {
    writeFileSync(join(workspace, 'plain.md'), '# Plain\n', 'utf-8')
    writeFileSync(
      join(workspace, 'annotated.md'),
      '# Annotated\n<!-- USER_MEMO id="m1" color="red" status="open" : fix -->\n',
      'utf-8',
    )

    const listDocuments = server.handlers.get('list_documents')!
    const all = parseJson(await listDocuments({ annotatedOnly: false })) as { files: string[] }
    const annotatedOnly = parseJson(await listDocuments({ annotatedOnly: true })) as { files: string[] }

    expect(all.files).toEqual(expect.arrayContaining(['plain.md', 'annotated.md']))
    expect(annotatedOnly.files).toEqual(['annotated.md'])
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
