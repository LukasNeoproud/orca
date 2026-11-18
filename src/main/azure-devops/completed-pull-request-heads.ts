import { requestAzureDevOpsJson } from './azure-devops-api-request'
import type { RawAzureDevOpsPullRequest } from './pull-request-mappers'
import { getAzureDevOpsRepoRef } from './repository-ref'

const PAGE_SIZE = 500

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
    const list = await requestAzureDevOpsJson<{ value?: RawAzureDevOpsPullRequest[] }>(
      repo,
      `/_apis/git/repositories/${encodeURIComponent(repo.repository)}/pullRequests`,
      {
        searchParams: {
          'searchCriteria.status': 'completed',
          'searchCriteria.targetRefName': `refs/heads/${targetBranch}`,
          $top: PAGE_SIZE
        }
      }
    )
    if (!list) {
      return null
    }
    const heads = new Map<string, Set<string>>()
    for (const pullRequest of list.value ?? []) {
      const branch = pullRequest.sourceRefName?.replace(/^refs\/heads\//, '')
      const commit = pullRequest.lastMergeSourceCommit?.commitId?.trim()
      if (branch && commit) {
        heads.set(branch, (heads.get(branch) ?? new Set()).add(commit))
      }
    }
    return heads
  } catch {
    return null
  }
}
