export function resolveWorkspaceFrom(argv: string[], env: NodeJS.ProcessEnv): string | undefined {
  const wsArgs = argv.filter(a => a.startsWith('--workspace='))
  const lastArg = wsArgs.length > 0 ? wsArgs[wsArgs.length - 1] : undefined
  if (lastArg) {
    const value = lastArg.slice('--workspace='.length)
    if (value) return value
  }
  return env.MD_FEEDBACK_WORKSPACE || undefined
}
