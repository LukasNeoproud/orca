/** A short id a person can type after `orca gates run`; it stays when the gate is renamed. */
export function qualityGateIdFromName(name: string, taken: ReadonlySet<string>): string {
  const slug =
    name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'gate'
  let id = slug
  for (let suffix = 2; taken.has(id); suffix++) {
    id = `${slug}-${suffix}`
  }
  return id
}
