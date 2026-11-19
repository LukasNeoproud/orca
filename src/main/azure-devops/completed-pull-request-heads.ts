import { requestAzureDevOpsJson } from './azure-devops-api-request'
import type { RawAzureDevOpsPullRequest } from './pull-request-mappers'
import { getAzureDevOpsRepoRef } from './repository-ref'

const PAGE_SIZE = 500
// Why a limit: one cleanup must not walk an unbounded history; 5000 pull requests cover years.
const MAX_PAGES = 10

/**
 * Source branches of pull requests completed into `targetBranch`, each with the commits it was
 * completed at. Null when the repository is not on Azure DevOps or the lookup failed.
 */
export async function listAzureDevOpsCompletedPullRequestHeads(
  repoPath: string,
  targetBranch: string,
  localGitOptions: { wslDistro?: string } = {}
): Promise<Map<string, Set<string>> | null> {
  try {
    const repo = await getAzureDevOpsRepoRef(repoPath, null, localGitOptions)
    if (!repo) {
      return null
    }
    const heads = new Map<string, Set<string>>()
    for (let page = 0; page < MAX_PAGES; page++) {
      const list = await requestAzureDevOpsJson<{ value?: RawAzureDevOpsPullRequest[] }>(
        repo,
        `/_apis/git/repositories/${encodeURIComponent(repo.repository)}/pullRequests`,
        {
          searchParams: {
            'searchCriteria.status': 'completed',
            'searchCriteria.targetRefName': `refs/heads/${targetBranch}`,
            $top: PAGE_SIZE,
            ...(page > 0 ? { $skip: page * PAGE_SIZE } : {})
          }
        }
      ).catch(() => null)
      if (!list) {
        // Why: the pages already read still prove their branches; only a failed first page is no answer.
        return page === 0 ? null : heads
      }
      const pullRequests = list.value ?? []
      for (const pullRequest of pullRequests) {
        const branch = pullRequest.sourceRefName?.replace(/^refs\/heads\//, '')
        const commit = pullRequest.lastMergeSourceCommit?.commitId?.trim()
        if (branch && commit) {
          heads.set(branch, (heads.get(branch) ?? new Set()).add(commit))
        }
      }
      if (pullRequests.length < PAGE_SIZE) {
        break
      }
    }
    return heads
  } catch {
    return null
  }
}
