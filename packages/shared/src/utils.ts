export function truncateText(value: string, maxLength = 120): string {
  return value.length > maxLength ? value.slice(0, maxLength) + '...' : value
}
