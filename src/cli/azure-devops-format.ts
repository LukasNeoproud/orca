import { azureDevOpsReviewThreadOriginLabel } from '../shared/azure-devops-review-thread-origin-label'
import type {
  AzureDevOpsReviewDetail,
  AzureDevOpsReviewDraftView,
  AzureDevOpsReviewListResult,
  AzureDevOpsReviewThread
} from '../shared/azure-devops-review-types'
import { isReviewCommandRunEvidence } from '../shared/review-command-run-evidence'
import { isReviewCodeCitation } from '../shared/review-finding'

export function formatAzureDevOpsPullRequestList(result: AzureDevOpsReviewListResult): string {
  const lines = result.pullRequests.map(
    (pr) =>
      `${pr.key}\n  !${pr.pullRequestId} ${pr.title}\n  ${pr.project}/${pr.repository} · ${pr.author.displayName} · ${pr.sourceBranch} → ${pr.targetBranch}${pr.isDraft ? ' · draft' : ''}${result.draftCounts[pr.key] ? ` · ${result.draftCounts[pr.key]} drafts` : ''}`
  )
  for (const error of result.errors) {
    lines.push(`warning: ${error.scope}: ${error.message}`)
  }
  for (const repoKey of result.truncatedRepoKeys ?? []) {
    lines.push(`warning: ${repoKey}: only the newest pull requests are listed; older ones exist.`)
  }
  if (result.pullRequests.length === 0) {
    lines.unshift('No pull requests.')
  }
  return lines.join('\n')
}

function draftLocation(draft: AzureDevOpsReviewDraftView): string {
  if (draft.kind === 'inline' && draft.anchor) {
    return `${draft.filePath}:${draft.anchor.startLine}-${draft.anchor.endLine}${draft.anchor.side === 'left' ? ' (old)' : ''}`
  }
  if (draft.kind === 'file') {
    return draft.filePath ?? ''
  }
  if (draft.kind === 'reply') {
    return `reply to thread ${draft.threadId}`
  }
  return 'general'
}

/** One line per piece of evidence with what Orca found when it checked it. */
function draftEvidenceLines(draft: AzureDevOpsReviewDraftView): string[] {
  return (draft.evidence ?? []).map((evidence, index) => {
    const check = draft.evidenceChecks?.[index]
    const where = isReviewCodeCitation(evidence)
      ? `${evidence.filePath}:${evidence.startLine}-${evidence.endLine}`
      : isReviewCommandRunEvidence(evidence)
        ? `gate run ${evidence.runId}`
        : evidence.kind
    const outcome = !check
      ? 'not checked'
      : check.status === 'confirmed'
        ? check.foundAt
          ? `confirmed at lines ${check.foundAt.startLine}-${check.foundAt.endLine}`
          : 'confirmed'
        : `${check.status === 'refuted' ? 'refuted' : 'not checked'} (${check.reason})`
    return `  evidence ${index + 1}: ${where} ${outcome}`
  })
}

export function formatAzureDevOpsDrafts(drafts: readonly AzureDevOpsReviewDraftView[]): string {
  if (drafts.length === 0) {
    return 'No drafts.'
  }
  return drafts
    .map((draft) => {
      const state = [
        draft.state,
        ...(draft.outdated ? ['outdated'] : []),
        ...(draft.severity ? [draft.severity] : []),
        ...(draft.certainty ? [draft.certainty] : [])
      ].join(', ')
      return [
        `${draft.id} [${state}] ${draftLocation(draft)}`,
        `  ${draft.body.split('\n').join('\n  ')}`,
        ...draftEvidenceLines(draft)
      ].join('\n')
    })
    .join('\n')
}

function threadLocation(thread: AzureDevOpsReviewThread): string {
  if (!thread.filePath) {
    return 'general'
  }
  if (thread.anchor) {
    return `${thread.filePath}:${thread.anchor.startLine}`
  }
  const origin = thread.outdated ? azureDevOpsReviewThreadOriginLabel(thread) : null
  return origin ? `${thread.filePath} (was ${origin})` : thread.filePath
}

export function formatAzureDevOpsPullRequestDetail(detail: AzureDevOpsReviewDetail): string {
  const pr = detail.pullRequest
  const sections = [
    `!${pr.pullRequestId} ${pr.title}`,
    `${pr.project}/${pr.repository} · ${pr.status}${pr.isDraft ? ' (draft)' : ''} · ${pr.author.displayName}`,
    `${pr.sourceBranch} → ${pr.targetBranch} · iteration ${detail.latestIteration?.id ?? '?'} · ${pr.sourceCommit ?? ''}`,
    pr.webUrl,
    '',
    pr.description.trim() || '(no description)',
    '',
    `Changes (${detail.changes.length}):`,
    ...detail.changes.map((change) => `  ${change.changeType} ${change.path}`),
    '',
    `Threads (${detail.threads.length}):`,
    ...detail.threads.map((thread) => {
      const comments = thread.comments
        .filter((comment) => !comment.isSystem)
        .map(
          (comment) => `    ${comment.author.displayName}: ${comment.content.split('\n').join(' ')}`
        )
      const state = thread.outdated ? `${thread.status}, outdated` : thread.status
      return [`  #${thread.id} [${state}] ${threadLocation(thread)}`, ...comments].join('\n')
    }),
    '',
    `Drafts (${detail.drafts.length}):`,
    formatAzureDevOpsDrafts(detail.drafts)
  ]
  return sections.join('\n')
}
