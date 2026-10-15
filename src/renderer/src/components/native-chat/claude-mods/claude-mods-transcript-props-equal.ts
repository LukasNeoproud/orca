type SiteProps = Record<string, unknown>

/** Whether two prop sets hold the same data, cheapest check first. */
export function claudeModsPropsEqual(a: SiteProps, b: SiteProps): boolean {
  const keys = Object.keys(a)
  if (keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]))) {
    return true
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}
