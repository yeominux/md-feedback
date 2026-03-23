export function log(msg: string): void {
  process.stderr.write(`[md-feedback] ${msg}\n`)
}
