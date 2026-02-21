export type ToolErrorCode =
  | 'FILE_SAFETY'
  | 'FILE_NOT_FOUND'
  | 'FILE_READ'
  | 'FILE_WRITE'
  | 'FILE_LOCK_TIMEOUT'
  | 'PATCH_APPLY'
  | 'MEMO_NOT_FOUND'
  | 'OPERATION_INVALID'
  | 'ANCHOR_NOT_FOUND'
  | 'HANDOFF_INVALID'
  | 'COMMENT_INTEGRITY'

export class ToolError extends Error {
  constructor(
    public readonly code: ToolErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ToolError'
  }
}

export class FileSafetyError extends ToolError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('FILE_SAFETY', message, details)
    this.name = 'FileSafetyError'
  }
}

export class FileNotFoundError extends ToolError {
  constructor(file: string) {
    super('FILE_NOT_FOUND', `File not found: ${file}`, { file })
    this.name = 'FileNotFoundError'
  }
}

export class FileReadError extends ToolError {
  constructor(file: string, cause?: string) {
    super('FILE_READ', `Cannot read file ${file}${cause ? `: ${cause}` : ''}`, {
      file,
      ...(cause ? { cause } : {}),
    })
    this.name = 'FileReadError'
  }
}

export class FileWriteError extends ToolError {
  constructor(file: string, cause?: string) {
    super('FILE_WRITE', `Cannot write file ${file}${cause ? `: ${cause}` : ''}`, {
      file,
      ...(cause ? { cause } : {}),
    })
    this.name = 'FileWriteError'
  }
}

export class FileLockTimeoutError extends ToolError {
  constructor(lockPath: string) {
    super('FILE_LOCK_TIMEOUT', `Timeout acquiring lock: ${lockPath}`, { lockPath })
    this.name = 'FileLockTimeoutError'
  }
}

export class PatchApplyError extends ToolError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('PATCH_APPLY', message, details)
    this.name = 'PatchApplyError'
  }
}

export class MemoNotFoundError extends ToolError {
  constructor(memoId: string) {
    super('MEMO_NOT_FOUND', `Memo not found: ${memoId}`, { memoId })
    this.name = 'MemoNotFoundError'
  }
}

export class OperationValidationError extends ToolError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('OPERATION_INVALID', message, details)
    this.name = 'OperationValidationError'
  }
}

export class AnchorNotFoundError extends ToolError {
  constructor(anchorText: string, details?: Record<string, unknown>) {
    super('ANCHOR_NOT_FOUND', `Anchor text not found: "${anchorText}"`, {
      anchorText,
      matchCount: 0,
      ...(details ?? {}),
    })
    this.name = 'AnchorNotFoundError'
  }
}

export class CommentIntegrityError extends ToolError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('COMMENT_INTEGRITY', message, details)
    this.name = 'CommentIntegrityError'
  }
}

export class InvalidHandoffError extends ToolError {
  constructor(file: string) {
    super('HANDOFF_INVALID', 'Not a valid handoff document', { file })
    this.name = 'InvalidHandoffError'
  }
}

export function serializeToolError(err: unknown): Record<string, unknown> {
  if (err instanceof ToolError) {
    return {
      error: err.message,
      code: err.code,
      type: err.name,
      ...(err.details ? { details: err.details } : {}),
    }
  }
  if (err instanceof Error) {
    return { error: err.message }
  }
  return { error: String(err) }
}
