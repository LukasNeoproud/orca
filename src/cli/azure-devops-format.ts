import type {
  AzureDevOpsReviewDetail,
  AzureDevOpsReviewDraftView,
  AzureDevOpsReviewListResult
} from '../shared/azure-devops-review-types'

export function formatAzureDevOpsPullRequestList(result: AzureDevOpsReviewListResult): string {
  const lines = result.pullRequests.map(
    (pr) =>
      `${pr.key}\n  !${pr.pullRequestId} ${pr.title}\n  ${pr.project}/${pr.repository} · ${pr.author.displayName} · ${pr.sourceBranch} → ${pr.targetBranch}${pr.isDraft ? ' · draft' : ''}${result.draftCounts[pr.key] ? ` · ${result.draftCounts[pr.key]} drafts` : ''}`
  )
  for (const error of result.errors) {
    lines.push(`warning: ${error.scope}: ${error.message}`)
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

export function formatAzureDevOpsDrafts(drafts: readonly AzureDevOpsReviewDraftView[]): string {
  if (drafts.length === 0) {
    return 'No drafts.'
  }
  return drafts
    .map(
      (draft) =>
        `${draft.id} [${draft.state}${draft.outdated ? ', outdated' : ''}] ${draftLocation(draft)}\n  ${draft.body.split('\n').join('\n  ')}`
    )
    .join('\n')
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
      const where = thread.filePath
        ? `${thread.filePath}${thread.anchor ? `:${thread.anchor.startLine}` : ''}`
        : 'general'
      const comments = thread.comments
        .filter((comment) => !comment.isSystem)
        .map(
          (comment) => `    ${comment.author.displayName}: ${comment.content.split('\n').join(' ')}`
        )
      return [`  #${thread.id} [${thread.status}] ${where}`, ...comments].join('\n')
    }),
    '',
    `Drafts (${detail.drafts.length}):`,
    formatAzureDevOpsDrafts(detail.drafts)
  ]
  return sections.join('\n')
}
