import type { AzureDevOpsReviewDraftCodeExcerpt } from '../../../shared/azure-devops-review-draft-finding-types'
import type {
  AzureDevOpsReviewDraftView,
  AzureDevOpsReviewIteration
} from '../../../shared/azure-devops-review-types'
import { mapWithConcurrency } from '../../../shared/map-with-concurrency'
import { checkReviewCodeCitation } from '../../../shared/review-code-citation-match'
import {
  deriveReviewFindingCertainty,
  isReviewCodeCitation,
  type ReviewEvidenceCheck,
  type ReviewFindingEvidence
} from '../../../shared/review-finding'
import type {
  AzureDevOpsReviewFileAtCommit,
  AzureDevOpsReviewFileReader
} from './azure-devops-review-file-line-cache'

const LOAD_CONCURRENCY = 4
const MAX_EXCERPT_LINES = 12
const MAX_EXCERPT_LINE_CHARS = 240

/** A file version as read for one batch of drafts; `failed` is a request that threw. */
type LoadedFile = AzureDevOpsReviewFileAtCommit | { state: 'not-loaded' } | { state: 'failed' }

function versionKey(path: string, commit: string): string {
  return `${commit}\n${path}`
}

function checkEvidence(
  evidence: ReviewFindingEvidence,
  commit: string | null,
  files: ReadonlyMap<string, LoadedFile>
): ReviewEvidenceCheck {
  if (!isReviewCodeCitation(evidence)) {
    return { status: 'unchecked', reason: 'unknown-kind' }
  }
  const file = commit ? files.get(versionKey(evidence.filePath, commit)) : undefined
  switch (file?.state) {
    case 'text':
      return checkReviewCodeCitation(evidence, file.lines)
    case 'missing':
      return { status: 'refuted', reason: 'file-missing' }
    case 'unreadable':
      return { status: 'unchecked', reason: 'unreadable-file' }
    case 'not-loaded':
      return { status: 'unchecked', reason: 'request-limit' }
    case 'failed':
      return { status: 'unchecked', reason: 'request-failed' }
    case undefined:
      return { status: 'unchecked', reason: 'commit-not-in-review' }
  }
}

function excerptOf(
  draft: AzureDevOpsReviewDraftView,
  file: LoadedFile | undefined
): AzureDevOpsReviewDraftCodeExcerpt | null {
  if (file?.state !== 'text' || !draft.anchor) {
    return null
  }
  const { startLine, endLine } = draft.anchor
  const commented = file.lines.slice(startLine - 1, endLine)
  if (commented.length === 0) {
    return null
  }
  return {
    startLine,
    lines: commented
      .slice(0, MAX_EXCERPT_LINES)
      .map((line) => line.slice(0, MAX_EXCERPT_LINE_CHARS)),
    ...(commented.length > MAX_EXCERPT_LINES ? { truncated: true } : {})
  }
}

/** The path whose lines an inline draft comments on the new side; null for every other draft. */
function excerptPath(draft: AzureDevOpsReviewDraftView): string | null {
  return draft.kind === 'inline' && draft.anchor?.side === 'right' ? draft.filePath : null
}

/**
 * Adds to unpublished drafts what the host can say about them as findings: its check of each
 * piece of evidence, the certainty of an agent's finding and the commented code.
 */
export async function describeAzureDevOpsReviewDraftFindings(args: {
  drafts: readonly AzureDevOpsReviewDraftView[]
  iterations: readonly AzureDevOpsReviewIteration[]
  readFile: AzureDevOpsReviewFileReader
}): Promise<AzureDevOpsReviewDraftView[]> {
  // Why only these: a draft names its own commit, and the reader would fetch any commit it is given.
  const reviewCommits = new Set(
    args.iterations.flatMap((iteration) =>
      iteration.sourceCommit ? [iteration.sourceCommit.toLowerCase()] : []
    )
  )
  const commitOf = (draft: AzureDevOpsReviewDraftView): string | null => {
    const commit = draft.commit?.toLowerCase() ?? null
    return commit && reviewCommits.has(commit) ? commit : null
  }
  const open = args.drafts.filter((draft) => draft.state !== 'published')

  const versions = new Map<string, { path: string; commit: string }>()
  const want = (path: string | null, commit: string | null): void => {
    if (path && commit) {
      versions.set(versionKey(path, commit), { path, commit })
    }
  }
  // Why evidence first: the reader stops at its request budget, and a check matters more.
  for (const draft of open) {
    for (const evidence of draft.evidence ?? []) {
      want(isReviewCodeCitation(evidence) ? evidence.filePath : null, commitOf(draft))
    }
  }
  for (const draft of open) {
    want(excerptPath(draft), commitOf(draft))
  }

  const files = new Map<string, LoadedFile>()
  await mapWithConcurrency([...versions], LOAD_CONCURRENCY, async ([key, version]) => {
    // Why caught: one failed file must not fail the pull request; its evidence reads as unchecked.
    const file = await args.readFile(version.path, version.commit).catch(() => 'failed' as const)
    files.set(key, file === 'failed' ? { state: 'failed' } : (file ?? { state: 'not-loaded' }))
  })

  return args.drafts.map((draft) => {
    if (draft.state === 'published') {
      return draft
    }
    const commit = commitOf(draft)
    const evidence = draft.evidence ?? []
    const evidenceChecks = evidence.map((item) => checkEvidence(item, commit, files))
    const path = excerptPath(draft)
    const codeExcerpt =
      path && commit ? excerptOf(draft, files.get(versionKey(path, commit))) : null
    return {
      ...draft,
      ...(evidence.length > 0 ? { evidenceChecks } : {}),
      // Why agents only: what a person writes is their own judgement, not a claim to check.
      ...(draft.author.kind === 'agent'
        ? { certainty: deriveReviewFindingCertainty(evidence, evidenceChecks) }
        : {}),
      ...(codeExcerpt ? { codeExcerpt } : {})
    }
  })
}
