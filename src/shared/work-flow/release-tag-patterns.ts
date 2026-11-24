/**
 * Tag patterns by which a repository marks its builds, stored as `workFlowReleaseTags` on the
 * repository row. `*` stands for any run of characters and `?` for one; the rest is literal.
 */

export type ReleaseTagPatterns = {
  /** Null turns the stage off: the repository then shows no release phase. */
  production: string | null
  dev: string | null
}

export type ReleaseTagStage = keyof ReleaseTagPatterns

/** A tag starting with `v` is a production build; the same shape ending in `-dev` a dev build. */
export const DEFAULT_RELEASE_TAG_PATTERNS: ReleaseTagPatterns = {
  production: 'v*',
  dev: 'v*-dev'
}

export const RELEASE_TAG_PATTERN_MAX_LENGTH = 100

export type ReleaseTagPatternProblem =
  | 'not-text'
  | 'too-long'
  /** Whitespace, a control character, or one of `~ ^ : \ [ ]`, none of which a tag name can hold. */
  | 'forbidden-character'
  /** Git would read it as an option. */
  | 'leading-dash'

export type ReleaseTagPatternCheck =
  | { ok: true; pattern: string | null }
  | { ok: false; problem: ReleaseTagPatternProblem }

const FORBIDDEN_PATTERN_CHARACTERS = '~^:\\[]'

function hasForbiddenCharacter(pattern: string): boolean {
  return [...pattern].some(
    (character) =>
      character <= ' ' ||
      character === '\u007f' ||
      /\s/.test(character) ||
      FORBIDDEN_PATTERN_CHARACTERS.includes(character)
  )
}

/** What a writer stores for typed input, or why it refuses. Null and blank turn the stage off. */
export function checkReleaseTagPattern(value: unknown): ReleaseTagPatternCheck {
  if (value === null) {
    return { ok: true, pattern: null }
  }
  if (typeof value !== 'string') {
    return { ok: false, problem: 'not-text' }
  }
  const pattern = value.trim()
  if (!pattern) {
    return { ok: true, pattern: null }
  }
  if (pattern.length > RELEASE_TAG_PATTERN_MAX_LENGTH) {
    return { ok: false, problem: 'too-long' }
  }
  if (hasForbiddenCharacter(pattern)) {
    return { ok: false, problem: 'forbidden-character' }
  }
  if (pattern.startsWith('-')) {
    return { ok: false, problem: 'leading-dash' }
  }
  return { ok: true, pattern }
}

/** A stored row before either pattern is checked. */
type UncheckedReleaseTagPatterns = Partial<Record<ReleaseTagStage, unknown>>

/** Patterns as any build stored them: a missing or invalid one reads as its default. */
export function readReleaseTagPatterns(value: unknown): ReleaseTagPatterns {
  const stored: UncheckedReleaseTagPatterns = value && typeof value === 'object' ? value : {}
  const read = (stage: ReleaseTagStage): string | null => {
    const check = stage in stored ? checkReleaseTagPattern(stored[stage]) : null
    return check?.ok ? check.pattern : DEFAULT_RELEASE_TAG_PATTERNS[stage]
  }
  return { production: read('production'), dev: read('dev') }
}

/** Linear in both lengths, unlike a regular expression built from the user's pattern. */
export function releaseTagMatchesPattern(tag: string, pattern: string): boolean {
  let tagIndex = 0
  let patternIndex = 0
  let starIndex = -1
  let tagIndexAtStar = 0
  while (tagIndex < tag.length) {
    const expected = pattern[patternIndex]
    if (expected === '*') {
      starIndex = patternIndex
      tagIndexAtStar = tagIndex
      patternIndex += 1
    } else if (expected === '?' || expected === tag[tagIndex]) {
      tagIndex += 1
      patternIndex += 1
    } else if (starIndex >= 0) {
      // Let the last `*` take one more character and try again from there.
      tagIndexAtStar += 1
      tagIndex = tagIndexAtStar
      patternIndex = starIndex + 1
    } else {
      return false
    }
  }
  while (pattern[patternIndex] === '*') {
    patternIndex += 1
  }
  return patternIndex === pattern.length
}

/** A tag both patterns match is a dev build: the default dev tags also start with `v`. */
export function classifyReleaseTag(
  tag: string,
  patterns: ReleaseTagPatterns
): ReleaseTagStage | null {
  if (patterns.dev !== null && releaseTagMatchesPattern(tag, patterns.dev)) {
    return 'dev'
  }
  if (patterns.production !== null && releaseTagMatchesPattern(tag, patterns.production)) {
    return 'production'
  }
  return null
}
