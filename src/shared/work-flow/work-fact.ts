/**
 * One thing a source (git, a review provider, the tracker) says about a unit of work. A source
 * that did not answer leaves the fact unknown with a reason; no reader may take that for "none".
 */

/**
 * - `not-loaded`: nobody has asked the source yet.
 * - `host-unreachable`: the host that leads the repository cannot be asked now.
 * - `host-unsupported`: that host's build does not report this fact.
 * - `not-connected`: the host that reads the source has no account or connection for it.
 * - `source-failed`: the source answered with an error, or not in time.
 * - `not-provided`: the source has no such fact, e.g. a provider without review verdicts.
 * - `not-found`, `not-permitted`: the source has no such item, or the account may not read it.
 * - `no-matching-tags`: the repository has no tag the pattern matches.
 * - `tags-stale`: no known tag holds the commit, and newer tags may exist that were not fetched.
 */
export const WORK_FACT_UNKNOWN_REASONS = [
  'not-loaded',
  'host-unreachable',
  'host-unsupported',
  'not-connected',
  'source-failed',
  'not-provided',
  'not-found',
  'not-permitted',
  'no-matching-tags',
  'tags-stale'
] as const
export type WorkFactUnknownReason = (typeof WORK_FACT_UNKNOWN_REASONS)[number]

export type WorkFact<T> =
  /** `readAt` is when the source answered, so a reader can tell how old the fact is. */
  | { known: true; value: T; readAt?: string }
  /** `lastKnown` is for display only; nothing is derived from it. */
  | { known: false; reason: WorkFactUnknownReason; lastKnown?: T }

export function knownWorkFact<T>(value: T, readAt?: string): WorkFact<T> {
  return readAt === undefined ? { known: true, value } : { known: true, value, readAt }
}

export function unknownWorkFact<T>(reason: WorkFactUnknownReason, lastKnown?: T): WorkFact<T> {
  return lastKnown === undefined ? { known: false, reason } : { known: false, reason, lastKnown }
}

/** The same fact once its source can no longer be asked: what it said stays for display only. */
export function forgetWorkFact<T>(fact: WorkFact<T>, reason: WorkFactUnknownReason): WorkFact<T> {
  return unknownWorkFact(reason, fact.known ? fact.value : fact.lastKnown)
}

/** A reason from a newer build reads as a failed source, never as a known fact. */
export function readWorkFactUnknownReason(value: unknown): WorkFactUnknownReason {
  return WORK_FACT_UNKNOWN_REASONS.find((reason) => reason === value) ?? 'source-failed'
}
