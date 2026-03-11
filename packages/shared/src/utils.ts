export function truncateText(value: string, maxLength = 120): string {
  return value.length > maxLength ? value.slice(0, maxLength) + '...' : value
}

/** Parse JSON with BOM stripping — prevents errors from UTF-8 BOM-prefixed files */
export function parseJsonWithBom<T>(text: string): T {
  return JSON.parse(text.replace(/^\uFEFF/, '')) as T
}
