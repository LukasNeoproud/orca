import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewIteration,
  AzureDevOpsReviewThread
} from '../../../shared/azure-devops-review-types'
import { mapWithConcurrency } from '../../../shared/map-with-concurrency'
import {
  trackAzureDevOpsReviewLines,
  type AzureDevOpsReviewTrackedLines
} from './azure-devops-review-line-tracking'
import type { RawReviewThread } from './azure-devops-review-mappers'

const LOAD_CONCURRENCY = 4

/** The comparison a thread was written on: `first === second` is an iteration against the base. */
export type AzureDevOpsReviewThreadOrigin = {
  firstIteration: number
  secondIteration: number
  changeTrackingId: number | null
}

export function azureDevOpsReviewThreadOrigin(
  raw: RawReviewThread
): AzureDevOpsReviewThreadOrigin | null {
  const context = raw.pullRequestThreadContext
  const second = context?.iterationContext?.secondComparingIteration
  if (typeof second !== 'number' || second < 1) {
    return null
  }
  const first = context?.iterationContext?.firstComparingIteration
  return {
    firstIteration: typeof first === 'number' && first >= 1 ? first : second,
    secondIteration: second,
    changeTrackingId:
      typeof context?.changeTrackingId === 'number' ? context.changeTrackingId : null
  }
}

/** Lines of a file at a commit; null when it is missing, binary or too large to compare. */
export type AzureDevOpsReviewLineLoader = (
  path: string,
  commit: string
) => Promise<readonly string[] | null>

type FileVersion = { path: string; commit: string }

type TrackingPlan = {
  before: FileVersion
  after: FileVersion
  /** Where a later iteration may have moved the file, tried when `after` does not exist. */
  renamed?: FileVersion
}

function baseCommit(iteration: AzureDevOpsReviewIteration | undefined): string | null {
  return iteration?.baseCommit ?? iteration?.targetCommit ?? null
}

/** The file versions to compare; null when the thread already sits on the latest iteration. */
export function planAzureDevOpsReviewThreadTracking(
  thread: AzureDevOpsReviewThread,
  origin: AzureDevOpsReviewThreadOrigin | null,
  iterations: readonly AzureDevOpsReviewIteration[],
  changes: readonly AzureDevOpsReviewChange[]
): TrackingPlan | null {
  const latest = iterations.reduce<AzureDevOpsReviewIteration | undefined>(
    (found, iteration) => (!found || iteration.id > found.id ? iteration : found),
    undefined
  )
  if (!thread.filePath || !thread.anchor || !origin || !latest) {
    return null
  }
  const byId = (id: number): AzureDevOpsReviewIteration | undefined =>
    iterations.find((iteration) => iteration.id === id)
  const change = changes.find((candidate) => candidate.path === thread.filePath)
  if (thread.anchor.side === 'left') {
    // The old side is the merge base, or the first iteration of an iteration-to-iteration compare.
    const before =
      origin.firstIteration === origin.secondIteration
        ? baseCommit(byId(origin.secondIteration))
        : (byId(origin.firstIteration)?.sourceCommit ?? null)
    const after = baseCommit(latest)
    const path = change?.originalPath ?? thread.filePath
    return before && after && before !== after
      ? { before: { path, commit: before }, after: { path, commit: after } }
      : null
  }
  const before = byId(origin.secondIteration)?.sourceCommit ?? null
  const after = latest.sourceCommit
  if (origin.secondIteration === latest.id || !before || !after || before === after) {
    return null
  }
  // Why: a later iteration may have renamed the file; the change tracking id follows it.
  const renamed =
    !change && origin.changeTrackingId !== null
      ? changes.find((candidate) => candidate.changeTrackingId === origin.changeTrackingId)
      : undefined
  return {
    before: { path: thread.filePath, commit: before },
    after: { path: thread.filePath, commit: after },
    ...(renamed ? { renamed: { path: renamed.path, commit: after } } : {})
  }
}

type FileLines = readonly string[] | null

/** The thread as the latest iteration shows it, given the file versions (null: unreadable). */
export function applyAzureDevOpsReviewThreadTracking(
  thread: AzureDevOpsReviewThread,
  plan: TrackingPlan,
  lines: { before: FileLines; after: FileLines; renamed?: FileLines }
): AzureDevOpsReviewThread {
  const anchor = thread.anchor
  if (!anchor) {
    return thread
  }
  const track = (after: FileLines): AzureDevOpsReviewTrackedLines | null =>
    lines.before && after
      ? trackAzureDevOpsReviewLines(lines.before, after, anchor.startLine, anchor.endLine)
      : null
  let tracked = track(lines.after)
  let filePath = thread.filePath
  if (!lines.after && plan.renamed) {
    // Why exact only: a reused id must not pin the thread into a file without the commented code.
    const inRenamed = track(lines.renamed ?? null)
    if (inRenamed && !inRenamed.changed) {
      tracked = inRenamed
      filePath = plan.renamed.path
    }
  }
  if (
    tracked &&
    !tracked.changed &&
    tracked.startLine === anchor.startLine &&
    tracked.endLine === anchor.endLine &&
    filePath === thread.filePath
  ) {
    return thread
  }
  return {
    ...thread,
    filePath,
    anchor: tracked
      ? { side: anchor.side, startLine: tracked.startLine, endLine: tracked.endLine }
      : null,
    originalAnchor: anchor,
    ...(tracked && !tracked.changed ? {} : { outdated: true })
  }
}

function versionKey(version: FileVersion): string {
  return `${version.commit}\n${version.path}`
}

/**
 * Moves threads written on an older iteration to where their lines are in the latest one.
 * Azure DevOps reports a thread at the lines of the iteration it was written on.
 */
export async function trackAzureDevOpsReviewThreads(args: {
  threads: readonly {
    thread: AzureDevOpsReviewThread
    origin: AzureDevOpsReviewThreadOrigin | null
  }[]
  iterations: readonly AzureDevOpsReviewIteration[]
  changes: readonly AzureDevOpsReviewChange[]
  loadLines: AzureDevOpsReviewLineLoader
}): Promise<AzureDevOpsReviewThread[]> {
  const planned = args.threads.map(({ thread, origin }) => ({
    thread,
    plan: planAzureDevOpsReviewThreadTracking(thread, origin, args.iterations, args.changes)
  }))
  const versions = new Map<string, FileVersion>()
  // Why open threads first: the loader stops fetching at its budget, and they matter most.
  const byUrgency = [...planned].sort(
    (a, b) => Number(a.thread.status !== 'active') - Number(b.thread.status !== 'active')
  )
  for (const { plan } of byUrgency) {
    for (const version of plan ? [plan.before, plan.after, plan.renamed] : []) {
      if (version) {
        versions.set(versionKey(version), version)
      }
    }
  }
  const lines = new Map<string, FileLines>()
  await mapWithConcurrency([...versions.values()], LOAD_CONCURRENCY, async (version) => {
    // Why: one unreadable file must not fail the whole pull request; its threads read as outdated.
    const loaded = await args.loadLines(version.path, version.commit).catch(() => null)
    lines.set(versionKey(version), loaded)
  })
  const linesOf = (version: FileVersion | undefined): FileLines =>
    (version && lines.get(versionKey(version))) ?? null
  return planned.map(({ thread, plan }) =>
    plan
      ? applyAzureDevOpsReviewThreadTracking(thread, plan, {
          before: linesOf(plan.before),
          after: linesOf(plan.after),
          renamed: linesOf(plan.renamed)
        })
      : thread
  )
}
