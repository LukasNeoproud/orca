import type {
  AzureDevOpsReviewIteration,
  AzureDevOpsReviewWorktreeInfo
} from '../../../shared/azure-devops-review-types'
import {
  normalizeQualityGateDefinitions,
  qualityGateRunLiveness,
  type QualityGateDefinition,
  type QualityGateRunView
} from '../../../shared/quality-gate-types'
import type {
  ReviewCommandRunEvidence,
  ReviewCommandRunSummary,
  ReviewCommandRunUncheckedReason
} from '../../../shared/review-command-run-evidence'
import type { ReviewEvidenceCheck } from '../../../shared/review-finding'
import type { Repo } from '../../../shared/repo-types'

/** What the host knows about gate runs for one pull request; none of it comes from the draft. */
export type AzureDevOpsReviewGateRunFacts = {
  /** This host's own record of a run; null when it keeps none under that id. */
  findRun: (runId: string) => QualityGateRunView | null
  /** The review worktree registered for the pull request; null when it has none. */
  reviewWorktree: AzureDevOpsReviewWorktreeInfo | null
  /** The gates the user set up for the repository of that worktree, as its row holds them now. */
  gates: readonly QualityGateDefinition[]
}

/** What `AzureDevOpsReviewHost` offers of the above; absent on a host wired without gates. */
export type AzureDevOpsReviewGateRunHost = {
  listRepos: () => Repo[]
  findReviewWorktree?: (
    repoKey: string,
    pullRequestKey?: string
  ) => AzureDevOpsReviewWorktreeInfo | null
  findGateRun?: (runId: string) => QualityGateRunView | null
}

/** Null when the host cannot look runs up at all, so every run reads as `runs-unavailable`. */
export function azureDevOpsReviewGateRunFacts(
  host: AzureDevOpsReviewGateRunHost,
  repoKey: string,
  pullRequestKey: string
): AzureDevOpsReviewGateRunFacts | null {
  if (!host.findGateRun) {
    return null
  }
  const found = host.findReviewWorktree?.(repoKey, pullRequestKey) ?? null
  // Why compared: the registry answers with the repo's latest review worktree when the pull
  // request has none, and that one holds another pull request's code.
  const reviewWorktree = found?.pullRequestKey === pullRequestKey ? found : null
  const repo = reviewWorktree
    ? host.listRepos().find((candidate) => candidate.id === reviewWorktree.repoId)
    : undefined
  return {
    findRun: host.findGateRun,
    reviewWorktree,
    // Why the row and not the proposal store: a gate an agent proposed is not the user's.
    gates: normalizeQualityGateDefinitions(repo?.qualityGates) ?? []
  }
}

function summaryOf(run: QualityGateRunView): ReviewCommandRunSummary {
  return {
    source: 'quality-gate',
    runId: run.id,
    worktreeId: run.worktreeId,
    name: run.gate.name,
    command: run.gate.command,
    status: run.status,
    exitCode: run.exitCode,
    commit: run.source?.head ?? null,
    cleanTree: run.source?.clean ?? null,
    finishedAt: run.finishedAt,
    outputTruncated: run.outputTruncated
  }
}

/** The newest iteration that pushed `commit`; null when none did. */
function iterationIdOf(
  iterations: readonly AzureDevOpsReviewIteration[],
  commit: string | null
): number | null {
  const ids = iterations
    .filter((iteration) => commit !== null && iteration.sourceCommit?.toLowerCase() === commit)
    .map((iteration) => iteration.id)
  return ids.length > 0 ? Math.max(...ids) : null
}

/**
 * Whether a gate run proves the finding that cites it. Confirmed only when this host's record
 * says a gate from the repository's settings failed in the review worktree of the pull request,
 * on the commit of the draft, with nothing uncommitted, and that commit is still the latest
 * iteration. A run that proves nothing is never a contradiction: the reason says what is missing.
 */
export function checkAzureDevOpsReviewGateRunEvidence(args: {
  evidence: ReviewCommandRunEvidence
  /** The commit of the draft, lower case; null when it is not a commit of the pull request. */
  draftCommit: string | null
  iterations: readonly AzureDevOpsReviewIteration[]
  facts: AzureDevOpsReviewGateRunFacts | null
}): ReviewEvidenceCheck {
  const { evidence, draftCommit, iterations, facts } = args
  const unchecked = (
    reason: ReviewCommandRunUncheckedReason | 'commit-not-in-review',
    run?: QualityGateRunView
  ): ReviewEvidenceCheck => ({
    status: 'unchecked',
    reason,
    ...(run ? { run: summaryOf(run) } : {})
  })
  if (!facts) {
    return unchecked('runs-unavailable')
  }
  const run = facts.findRun(evidence.runId)
  if (!run) {
    return unchecked('run-not-found')
  }
  // Why no summary yet: a run of another workspace is not this pull request's to describe.
  if (
    !facts.reviewWorktree ||
    run.worktreeId !== facts.reviewWorktree.worktreeId ||
    run.repoId !== facts.reviewWorktree.repoId
  ) {
    return unchecked('run-other-worktree')
  }
  const gate = facts.gates.find((candidate) => candidate.id === run.gateId)
  if (!gate || gate.command !== run.gate.command) {
    return unchecked('run-gate-changed', run)
  }
  if (!draftCommit) {
    return unchecked('commit-not-in-review', run)
  }
  // Why before the commit: a queued run has not read the tree yet.
  if (qualityGateRunLiveness(run.status) === 'live') {
    return unchecked('run-not-finished', run)
  }
  const draftIteration = iterationIdOf(iterations, draftCommit)
  const runCommit = run.source?.head?.toLowerCase() ?? null
  if (runCommit !== draftCommit) {
    const runIteration = iterationIdOf(iterations, runCommit)
    return unchecked(
      runIteration !== null && draftIteration !== null && runIteration < draftIteration
        ? 'run-stale-commit'
        : 'run-other-commit',
      run
    )
  }
  // Why the latest only: a failure on an older push says nothing about what would be published.
  const latest = Math.max(...iterations.map((iteration) => iteration.id))
  if (draftIteration !== latest) {
    return unchecked('run-stale-commit', run)
  }
  if (run.source?.clean !== true) {
    return unchecked('run-dirty-tree', run)
  }
  if (run.status === 'passed') {
    return unchecked('run-passed', run)
  }
  if (run.status !== 'failed') {
    return unchecked('run-no-verdict', run)
  }
  return { status: 'confirmed', run: summaryOf(run) }
}
