import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS,
  azureDevOpsReviewFilterOptions,
  filterAzureDevOpsReviewPullRequests,
  reconcileAzureDevOpsReviewFilters
} from './azure-devops-review-filters'
import {
  azureDevOpsPullRequestKey,
  parseAzureDevOpsPullRequestKey,
  type AzureDevOpsReviewPullRequest,
  type AzureDevOpsReviewRepo
} from './azure-devops-review-types'

function repo(org: string, project: string, repository: string): AzureDevOpsReviewRepo {
  return {
    key: `${org}/${project}/${repository}`.toLowerCase(),
    organizationKey: org,
    organizationUrl: `https://${org}`,
    organizationLabel: org.split('/').at(-1) ?? org,
    project,
    repository,
    orcaRepoIds: ['r1']
  }
}

function pr(
  id: number,
  source: AzureDevOpsReviewRepo,
  patch: Partial<AzureDevOpsReviewPullRequest> = {}
) {
  return {
    key: azureDevOpsPullRequestKey(source.organizationKey, 'repo-id', id),
    pullRequestId: id,
    title: `Change ${id}`,
    description: '',
    status: 'active',
    isDraft: false,
    isFork: false,
    organizationKey: source.organizationKey,
    organizationLabel: source.organizationLabel,
    project: source.project,
    repository: source.repository,
    repositoryId: 'repo-id',
    repoKey: source.key,
    author: { displayName: 'Ada', uniqueName: null },
    myVote: 'none',
    createdAt: '2026-10-01T00:00:00Z',
    closedAt: null,
    sourceBranch: 'feature',
    targetBranch: 'main',
    sourceCommit: null,
    targetCommit: null,
    webUrl: '',
    ...patch
  } satisfies AzureDevOpsReviewPullRequest
}

const web = repo('dev.azure.com/contoso', 'Web', 'app')
const api = repo('dev.azure.com/contoso', 'Api', 'service')

describe('pull request keys', () => {
  it('round-trips keys whose organization contains a port and path', () => {
    const key = azureDevOpsPullRequestKey('tfs.example.com:8080/tfs/coll', 'ABC', 12)
    expect(key).toBe('tfs.example.com:8080/tfs/coll+abc+12')
    expect(parseAzureDevOpsPullRequestKey(key)).toEqual({
      organizationKey: 'tfs.example.com:8080/tfs/coll',
      repositoryId: 'abc',
      pullRequestId: 12
    })
    expect(parseAzureDevOpsPullRequestKey('nope+12')).toBeNull()
    expect(parseAzureDevOpsPullRequestKey('org+repo+0')).toBeNull()
  })
})

describe('filterAzureDevOpsReviewPullRequests', () => {
  const prs = [pr(1, web), pr(2, api, { author: { displayName: 'Grace', uniqueName: null } })]

  it('keeps everything with the default filters', () => {
    expect(
      filterAzureDevOpsReviewPullRequests(prs, DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS)
    ).toHaveLength(2)
  })

  it('filters by project, repo and search text', () => {
    const base = DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS
    expect(
      filterAzureDevOpsReviewPullRequests(prs, { ...base, project: 'dev.azure.com/contoso/api' })
    ).toEqual([prs[1]])
    expect(filterAzureDevOpsReviewPullRequests(prs, { ...base, repo: web.key })).toEqual([prs[0]])
    expect(filterAzureDevOpsReviewPullRequests(prs, { ...base, query: 'grace' })).toEqual([prs[1]])
    expect(filterAzureDevOpsReviewPullRequests(prs, { ...base, status: 'completed' })).toEqual([])
  })
})

describe('azureDevOpsReviewFilterOptions', () => {
  it('labels projects with the org only when several orgs are tracked', () => {
    expect(azureDevOpsReviewFilterOptions([web, api], 'all').projects.map((p) => p.label)).toEqual([
      'Api',
      'Web'
    ])
    const other = repo('dev.azure.com/fabrikam', 'Web', 'site')
    expect(
      azureDevOpsReviewFilterOptions([web, other], 'all').projects.map((p) => p.label)
    ).toEqual(['contoso / Web', 'fabrikam / Web'])
  })

  it('limits repos to the selected project', () => {
    expect(
      azureDevOpsReviewFilterOptions([web, api], 'dev.azure.com/contoso/web').repos.map(
        (r) => r.label
      )
    ).toEqual(['app'])
  })
})

describe('reconcileAzureDevOpsReviewFilters', () => {
  it('resets selections that no longer exist', () => {
    const filters = { ...DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS, project: 'gone', repo: 'gone/x' }
    expect(reconcileAzureDevOpsReviewFilters(filters, [web])).toMatchObject({
      project: 'all',
      repo: 'all'
    })
    const kept = { ...DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS, repo: web.key }
    expect(reconcileAzureDevOpsReviewFilters(kept, [web])).toBe(kept)
  })
})
