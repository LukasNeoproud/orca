import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import { refuseAzureDevOpsReviewWorktreeExecution } from '../azure-devops/review/azure-devops-review-worktree-execution'
import { createQualityGateChangeFeed, type QualityGateChangeFeed } from './quality-gate-change-feed'
import { runQualityGateCommand } from './quality-gate-command-run'
import { createQualityGateRunStore, defaultQualityGateRunStorePath } from './quality-gate-run-store'
import { createQualityGateService, type QualityGateService } from './quality-gate-service'
import {
  createQualityGateSourceReader,
  type QualityGateSourceReader
} from './quality-gate-source-reader'
import { readQualityGateSourceState } from './quality-gate-source-state'

let service: QualityGateService | null = null
let changeFeed: QualityGateChangeFeed | null = null
let sourceReader: QualityGateSourceReader | null = null

/** Shared by the feed and the service, so the status asked for after a signal reuses its read. */
function getSourceReader(): QualityGateSourceReader {
  sourceReader ??= createQualityGateSourceReader({ read: readQualityGateSourceState })
  return sourceReader
}

/** What `qualityGates.subscribe` listens to; the service of this process reports its runs into it. */
export function getQualityGateChangeFeed(): QualityGateChangeFeed {
  changeFeed ??= createQualityGateChangeFeed({ readSource: getSourceReader() })
  return changeFeed
}

/** The gate runner of this host process: its own queue, its own records, its own data directory. */
export function getQualityGateService(): QualityGateService {
  service ??= createQualityGateService({
    store: createQualityGateRunStore({ filePath: defaultQualityGateRunStorePath() }),
    hostInstanceId: randomUUID(),
    runCommand: runQualityGateCommand,
    readSource: getSourceReader(),
    runnerDirectory: join(getAppEnvironment().getPath('userData'), 'quality-gate-runners'),
    now: Date.now,
    newRunId: randomUUID,
    onRunChanged: (worktreeId) => getQualityGateChangeFeed().notify(worktreeId),
    // A review worktree runs the pull request author's code, so only at a depth the user chose.
    refuseRun: refuseAzureDevOpsReviewWorktreeExecution
  })
  return service
}

/**
 * Stops this host's gate commands, process trees included, before Orca exits. Never rejects and
 * never creates the service: a process that ran no gate has nothing to stop.
 */
export async function stopQualityGatesForShutdown(): Promise<void> {
  if (!service) {
    return
  }
  try {
    const { unsettled } = await service.shutdown()
    if (unsettled > 0) {
      console.warn(
        `[quality-gates] ${unsettled} run(s) did not stop before quit; left unverifiable`
      )
    }
  } catch (error) {
    console.warn('[quality-gates] could not stop runs on quit:', error)
  }
}

/** @internal - tests install a service over a temp store. */
export function _setQualityGateServiceForTests(next: QualityGateService | null): void {
  service = next
}

/** @internal - tests install a feed with a short watch interval. */
export function _setQualityGateChangeFeedForTests(next: QualityGateChangeFeed | null): void {
  changeFeed = next
}
