import { AZURE_DEVOPS_WORK_FACTS_REFRESH_MS } from '../../../shared/azure-devops-pull-request-work-facts'
import type { Repo } from '../../../shared/repo-types'
import {
  refreshAzureDevOpsWorkFacts,
  type AzureDevOpsWorkFactsRound
} from './azure-devops-work-facts-refresh'
import { azureDevOpsWorkFacts } from './azure-devops-work-facts-store'

// Why a delay: the first round should not compete with restoring the workspace session.
const FIRST_ROUND_DELAY_MS = 20_000
const RETRY_MS = 60_000

export type AzureDevOpsWorkFactsScheduleDeps = {
  listRepos: () => Repo[]
  /** False while the machine has no network; a host that cannot tell answers true. */
  isOnline: () => boolean
  runRound?: () => Promise<Pick<AzureDevOpsWorkFactsRound, 'failed'>>
}

/** The wait before the next round: a failed one retries after a minute, doubling to the interval. */
export function nextAzureDevOpsWorkFactsDelay(failuresInARow: number): number {
  if (failuresInARow <= 0) {
    return AZURE_DEVOPS_WORK_FACTS_REFRESH_MS
  }
  return Math.min(RETRY_MS * 2 ** (failuresInARow - 1), AZURE_DEVOPS_WORK_FACTS_REFRESH_MS)
}

/**
 * Keeps the work flow facts of the user's pull requests current in this host's main process,
 * whether or not a window is open or automatic review is on. Returns the function that stops it.
 */
export function startAzureDevOpsWorkFactsRefresh(
  deps: AzureDevOpsWorkFactsScheduleDeps
): () => void {
  const runRound = deps.runRound ?? (() => refreshAzureDevOpsWorkFacts(deps, azureDevOpsWorkFacts))
  let failures = 0
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const schedule = (delayMs: number): void => {
    timer = setTimeout(() => void tick(), delayMs)
    timer.unref?.()
  }
  const tick = async (): Promise<void> => {
    // Why no round offline: every request would fail and count as the source failing.
    if (!deps.isOnline()) {
      schedule(RETRY_MS)
      return
    }
    const failed = await runRound().then(
      (round) => round.failed,
      () => true
    )
    if (stopped) {
      return
    }
    failures = failed ? failures + 1 : 0
    schedule(nextAzureDevOpsWorkFactsDelay(failures))
  }
  schedule(FIRST_ROUND_DELAY_MS)
  return () => {
    stopped = true
    if (timer) {
      clearTimeout(timer)
    }
  }
}
