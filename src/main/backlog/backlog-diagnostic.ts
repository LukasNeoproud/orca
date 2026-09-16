const MAX_DIAGNOSTIC = 8_192

export function backlogErrorMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error)
  if (
    /spawn .*backlog.*ENOENT|backlog: (?:command )?not found|backlog.*is not recognized/i.test(
      value
    )
  ) {
    return 'Backlog CLI is not installed on this execution host. Install backlog.md and try again.'
  }
  if (
    /not initialized|not a backlog|no backlog (?:project|configuration)|run.*backlog init/i.test(
      value
    )
  ) {
    return 'Backlog is not configured in this workspace. Run backlog init in this workspace and try again.'
  }
  return value.slice(0, MAX_DIAGNOSTIC) || 'Backlog command failed.'
}

export function isUnsupportedWatch(value: string): boolean {
  return /(?:unknown|unrecognized|unexpected|invalid) (?:option|argument).*--watch|--watch.*(?:unknown|unrecognized|unsupported)/i.test(
    value
  )
}
