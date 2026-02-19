export type IdSeparator = '-' | '_'

export interface GenerateIdOptions {
  separator?: IdSeparator
  randomLength?: number
}

/** Generate stable-looking opaque IDs without external dependencies. */
export function generateId(prefix: string, options: GenerateIdOptions = {}): string {
  const separator = options.separator ?? '-'
  const randomLength = options.randomLength ?? 6
  const ts = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 2 + randomLength).padEnd(randomLength, '0')
  return `${prefix}${separator}${ts}${separator}${random}`
}

