export type SharedErrorCode =
  | 'PARSE_JSON'

/**
 * Shared package error model.
 *
 * Scope (current):
 * - JSON parsing failures in shared parsing/roundtrip pipelines.
 *
 * Expansion policy:
 * - Add a new `SharedErrorCode` only when callers need to branch behavior
 *   by error category (not just by message text).
 * - Prefer domain-specific subclasses over generic `Error`.
 */
export class SharedError extends Error {
  constructor(
    public readonly code: SharedErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'SharedError'
  }
}

export class SharedJsonParseError extends SharedError {
  constructor(context: string, details?: Record<string, unknown>) {
    super('PARSE_JSON', `Failed to parse JSON in ${context}`, details)
    this.name = 'SharedJsonParseError'
  }
}

export function parseJsonStrict<T>(raw: string, context: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    throw new SharedJsonParseError(context, {
      raw,
      cause: err instanceof Error ? err.message : String(err),
    })
  }
}
