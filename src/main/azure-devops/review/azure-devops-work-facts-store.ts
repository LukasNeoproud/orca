import {
  AZURE_DEVOPS_WORK_FACTS_VALID_MS,
  type AzureDevOpsPullRequestActivity
} from '../../../shared/azure-devops-pull-request-work-facts'
import type { AzureDevOpsReviewPullRequest } from '../../../shared/azure-devops-review-types'

export type AzureDevOpsStoredActivity = {
  activity: AzureDevOpsPullRequestActivity
  /** Source commit the last version was dated for; a new one means a new iteration. */
  sourceCommit: string | null
  /** What the list showed when the activity was read; a different one is read first. */
  fingerprint: string
}

/** Why the pull requests of a repository are unknown, in the work flow's vocabulary. */
export type AzureDevOpsWorkFactsUnknownReason = 'not-loaded' | 'not-connected' | 'source-failed'

export type AzureDevOpsWorkFactsSnapshot = {
  /** The pull requests the signed-in user created, as last listed, with the activity read so far. */
  pullRequests: AzureDevOpsReviewPullRequest[]
  /** Repositories, by `AzureDevOpsReviewRepo.key`, whose pull requests are not known now. */
  unknownRepos: { repoKey: string; reason: AzureDevOpsWorkFactsUnknownReason }[]
}

type Listing = { pullRequests: AzureDevOpsReviewPullRequest[]; readAtMs: number }

/** What the background refresh last read. In memory only: a restart reads it again. */
export class AzureDevOpsWorkFactsStore {
  private readonly activities = new Map<string, AzureDevOpsStoredActivity>()
  private readonly listings = new Map<string, Listing>()
  private readonly problems = new Map<string, AzureDevOpsWorkFactsUnknownReason>()
  private readonly listeners = new Set<() => void>()

  recordListing(
    repoKey: string,
    pullRequests: AzureDevOpsReviewPullRequest[],
    readAtMs: number
  ): void {
    this.listings.set(repoKey, { pullRequests, readAtMs })
    this.problems.delete(repoKey)
  }

  /** The last listing stays until it is too old: one failed round changes nothing. */
  recordProblem(repoKey: string, reason: AzureDevOpsWorkFactsUnknownReason): void {
    this.problems.set(repoKey, reason)
    if (reason === 'not-connected') {
      this.listings.delete(repoKey)
    }
  }

  /** Forgets repositories Orca no longer has. */
  keepRepos(repoKeys: ReadonlySet<string>): void {
    for (const map of [this.listings, this.problems]) {
      for (const key of map.keys()) {
        if (!repoKeys.has(key)) {
          map.delete(key)
        }
      }
    }
  }

  storedActivity(pullRequestKey: string): AzureDevOpsStoredActivity | undefined {
    return this.activities.get(pullRequestKey)
  }

  recordActivity(pullRequestKey: string, stored: AzureDevOpsStoredActivity): void {
    this.activities.set(pullRequestKey, stored)
  }

  keepActivities(pullRequestKeys: ReadonlySet<string>): void {
    for (const key of this.activities.keys()) {
      if (!pullRequestKeys.has(key)) {
        this.activities.delete(key)
      }
    }
  }

  /** The pull request with the activity the refresh read for it, when it is the user's and open. */
  withActivity(pullRequest: AzureDevOpsReviewPullRequest): AzureDevOpsReviewPullRequest {
    const stored = this.activities.get(pullRequest.key)
    if (!stored || !pullRequest.workFacts || pullRequest.status !== 'active') {
      return pullRequest
    }
    return { ...pullRequest, workFacts: { ...pullRequest.workFacts, activity: stored.activity } }
  }

  snapshot(nowMs: number): AzureDevOpsWorkFactsSnapshot {
    const snapshot: AzureDevOpsWorkFactsSnapshot = { pullRequests: [], unknownRepos: [] }
    const repoKeys = new Set([...this.listings.keys(), ...this.problems.keys()])
    for (const repoKey of [...repoKeys].sort()) {
      const listing = this.listings.get(repoKey)
      if (listing && nowMs - listing.readAtMs <= AZURE_DEVOPS_WORK_FACTS_VALID_MS) {
        snapshot.pullRequests.push(...listing.pullRequests.map((pr) => this.withActivity(pr)))
      } else {
        snapshot.unknownRepos.push({
          repoKey,
          reason: this.problems.get(repoKey) ?? 'source-failed'
        })
      }
    }
    return snapshot
  }

  onChanged(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  notifyChanged(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

/** The store of this host's main process. */
export const azureDevOpsWorkFacts = new AzureDevOpsWorkFactsStore()

export function withAzureDevOpsWorkFactsActivity(
  pullRequest: AzureDevOpsReviewPullRequest
): AzureDevOpsReviewPullRequest {
  return azureDevOpsWorkFacts.withActivity(pullRequest)
}
