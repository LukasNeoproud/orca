import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import { runQualityGateCommand } from './quality-gate-command-run'
import { createQualityGateRunStore, defaultQualityGateRunStorePath } from './quality-gate-run-store'
import { createQualityGateService, type QualityGateService } from './quality-gate-service'
import { readQualityGateSourceState } from './quality-gate-source-state'

let service: QualityGateService | null = null

/** The gate runner of this host process: its own queue, its own records, its own data directory. */
export function getQualityGateService(): QualityGateService {
  service ??= createQualityGateService({
    store: createQualityGateRunStore({ filePath: defaultQualityGateRunStorePath() }),
    hostInstanceId: randomUUID(),
    runCommand: runQualityGateCommand,
    readSource: readQualityGateSourceState,
    runnerDirectory: join(getAppEnvironment().getPath('userData'), 'quality-gate-runners'),
    now: Date.now,
    newRunId: randomUUID
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
