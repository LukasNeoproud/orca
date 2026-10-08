import type { Repo } from '../../../shared/repo-types'
import type { AzureDevOpsReviewRepo } from '../../../shared/azure-devops-review-types'
import { isFolderRepo } from '../../../shared/repo-kind'
import { getAzureDevOpsRepoRef, type AzureDevOpsRepoRef } from '../repository-ref'
import { azureDevOpsOrganizationForRepo } from '../azure-devops-organization'

export type AzureDevOpsReviewRepoSource = AzureDevOpsReviewRepo & {
  /** Local clone used for review worktrees; the first one Orca knows. */
  primaryRepo: Repo
  ref: AzureDevOpsRepoRef
}

/** Review supports local clones only: SSH and remote-runtime repos are skipped. */
export function isAzureDevOpsReviewEligibleRepo(repo: Repo): boolean {
  if (repo.connectionId || isFolderRepo(repo)) {
    return false
  }
  return repo.executionHostId == null || repo.executionHostId === 'local'
}

export function azureDevOpsReviewRepoKey(
  organizationKey: string,
  project: string,
  repository: string
): string {
  return `${organizationKey}/${project}/${repository}`.toLowerCase()
}

/** Azure Repos repositories behind the Orca projects, deduplicated across clones. */
export async function collectAzureDevOpsReviewRepos(
  repos: readonly Repo[],
  resolveRef: (repo: Repo) => Promise<AzureDevOpsRepoRef | null> = (repo) =>
    getAzureDevOpsRepoRef(repo.path)
): Promise<AzureDevOpsReviewRepoSource[]> {
  const eligible = repos.filter(isAzureDevOpsReviewEligibleRepo)
  const refs = await Promise.all(
    eligible.map(async (repo) => ({ repo, ref: await resolveRef(repo).catch(() => null) }))
  )
  const byKey = new Map<string, AzureDevOpsReviewRepoSource>()
  for (const { repo, ref } of refs) {
    const organization = ref ? azureDevOpsOrganizationForRepo(ref) : null
    if (!ref || !organization) {
      continue
    }
    const key = azureDevOpsReviewRepoKey(organization.organizationKey, ref.project, ref.repository)
    const existing = byKey.get(key)
    if (existing) {
      existing.orcaRepoIds.push(repo.id)
      continue
    }
    byKey.set(key, {
      key,
      organizationKey: organization.organizationKey,
      organizationUrl: organization.organizationUrl,
      organizationLabel: organization.label,
      project: ref.project,
      repository: ref.repository,
      orcaRepoIds: [repo.id],
      primaryRepo: repo,
      ref
    })
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export function toAzureDevOpsReviewRepo(
  source: AzureDevOpsReviewRepoSource
): AzureDevOpsReviewRepo {
  return {
    key: source.key,
    organizationKey: source.organizationKey,
    organizationUrl: source.organizationUrl,
    organizationLabel: source.organizationLabel,
    project: source.project,
    repository: source.repository,
    orcaRepoIds: [...source.orcaRepoIds]
  }
}
