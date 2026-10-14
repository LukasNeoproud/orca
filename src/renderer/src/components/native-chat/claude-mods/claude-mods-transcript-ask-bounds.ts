import type { ClaudeModsSiteProps } from './claude-mods-transcript-props'

/** Under the host's bound for a request body (160 KiB), leaving room for the address and viewport. */
const MAX_ASK_PROPS_CHARS = 120 * 1024
/** Largest first, so a message that fits is not cut because a sibling field was big. */
const STRING_CAPS = [96, 64, 32, 16, 8, 4, 2, 1].map((kib) => kib * 1024).concat(512, 128)
const MAX_SCALAR_STRING_CHARS = 256

/** `value` cut to `max` chars, never between the halves of a surrogate pair. */
export function cutClaudeModsString(value: string, max: number): string {
  if (value.length <= max) {
    return value
  }
  const cut = value.slice(0, max)
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut
}

function jsonLength(value: unknown): number {
  try {
    return JSON.stringify(value).length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function cutStrings(value: unknown, max: number): unknown {
  if (typeof value === 'string') {
    return cutClaudeModsString(value, max)
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cutStrings(entry, max))
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cutStrings(entry, max)])
    )
  }
  return value
}

function cutPropStrings(props: ClaudeModsSiteProps, max: number): ClaudeModsSiteProps {
  return Object.fromEntries(
    Object.entries(props).map(([key, entry]) => [key, cutStrings(entry, max)])
  )
}

/**
 * `props` trimmed until the host takes the request: a request over its bound is refused, which
 * would cost the whole component its mods. Long strings are cut first, then a group's calls.
 */
export function fitClaudeModsAskProps(props: ClaudeModsSiteProps): ClaudeModsSiteProps {
  if (jsonLength(props) <= MAX_ASK_PROPS_CHARS) {
    return props
  }
  let fitted = props
  for (const cap of STRING_CAPS) {
    fitted = cutPropStrings(props, cap)
    if (jsonLength(fitted) <= MAX_ASK_PROPS_CHARS) {
      return fitted
    }
  }
  const { calls } = fitted
  if (Array.isArray(calls)) {
    for (let keep = Math.floor(calls.length / 2); keep >= 1; keep = Math.floor(keep / 2)) {
      const fewer = { ...fitted, calls: calls.slice(0, keep) }
      if (jsonLength(fewer) <= MAX_ASK_PROPS_CHARS) {
        return fewer
      }
    }
  }
  return Object.fromEntries(
    Object.entries(fitted).filter(
      ([, entry]) =>
        entry === null ||
        typeof entry === 'boolean' ||
        typeof entry === 'number' ||
        (typeof entry === 'string' && entry.length <= MAX_SCALAR_STRING_CHARS)
    )
  )
}

/**
 * A mod passing a cut top-level string through unchanged did not write it: the reply gets the
 * original back, so Orca never draws the trimmed copy as if the mod had chosen it.
 */
export function restoreClaudeModsCutStrings(
  replied: ClaudeModsSiteProps,
  original: ClaudeModsSiteProps,
  sent: ClaudeModsSiteProps
): ClaudeModsSiteProps {
  if (sent === original) {
    return replied
  }
  const restored = { ...replied }
  for (const [key, value] of Object.entries(replied)) {
    const first = original[key]
    if (typeof value === 'string' && typeof first === 'string' && value === sent[key]) {
      restored[key] = first
    }
  }
  return restored
}
