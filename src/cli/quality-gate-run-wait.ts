import type {
  QualityGateRunOutput,
  QualityGateRunStartResult,
  QualityGateRunView,
  QualityGateStatusResult
} from '../shared/quality-gate-types'
import { RuntimeClientError, type RuntimeRpcSuccess } from './runtime-client'

export type QualityGateCliRun = {
  run: QualityGateRunView
  /** False when the gate was already running and this is that run. */
  started: boolean
  stdout: string
  stderr: string
}

export type QualityGateCliRunResult = {
  /**
   * `failed` when a required gate ended without passing; `unverifiable` when none did but the
   * outcome of one could not be observed; optional gates never change it.
   */
  outcome: 'passed' | 'failed' | 'unverifiable'
  runs: QualityGateCliRun[]
}

export type QualityGateRpcCall = <TResult>(
  method: string,
  params: unknown
) => Promise<RuntimeRpcSuccess<TResult>>

export const QUALITY_GATE_POLL_MS = 1_000
/** Consecutive failed polls before the runs are reported as unverifiable. */
export const QUALITY_GATE_LOST_CONTACT_POLLS = 5

const LOST_CONTACT =
  'Contact with the Orca host was lost while the gate was running, so its outcome was not observed. It may still be running: check orca gates status.'

// A refusal the host sent is an answer; only a call that got no answer is lost contact.
function isLostContact(error: unknown): boolean {
  return (
    error instanceof RuntimeClientError &&
    (error.code === 'runtime_unavailable' || error.code === 'runtime_timeout')
  )
}

function unobserved(run: QualityGateRunView): QualityGateRunView {
  return {
    ...run,
    status: 'unverifiable',
    liveness: 'unverifiable',
    exitCode: null,
    error: LOST_CONTACT,
    freshness: null
  }
}

export function qualityGateRunOutcome(
  runs: QualityGateRunView[]
): QualityGateCliRunResult['outcome'] {
  const required = runs.filter((run) => run.gate.required)
  if (required.some((run) => run.liveness === 'exited' && run.status !== 'passed')) {
    return 'failed'
  }
  return required.every((run) => run.status === 'passed') ? 'passed' : 'unverifiable'
}

/**
 * Wait until the host reports every started run as no longer live, then read each run's record and
 * output. Losing the host mid-run is not a failed gate: the runs come back as `unverifiable`.
 */
export async function waitForQualityGateRuns(options: {
  call: QualityGateRpcCall
  worktree: string
  started: QualityGateRunStartResult
  sleep: (ms: number) => Promise<void>
}): Promise<QualityGateCliRunResult> {
  const { call, worktree, started, sleep } = options
  const pending = new Map(started.runs.map(({ run }) => [run.id, run]))
  const lastSeen = new Map(pending)
  let failedPolls = 0
  let lostContact = false

  while (pending.size > 0) {
    try {
      const status = await call<QualityGateStatusResult>('qualityGates.status', { worktree })
      failedPolls = 0
      for (const [runId, run] of pending) {
        const latest = status.result.gates.find((entry) => entry.gate.id === run.gateId)?.latestRun
        // A newer run of the gate can only exist once this one is over: live runs are not doubled.
        if (!latest || latest.id !== runId || latest.liveness !== 'live') {
          pending.delete(runId)
        } else {
          lastSeen.set(runId, latest)
        }
      }
    } catch (error) {
      if (!isLostContact(error)) {
        throw error
      }
      if (++failedPolls >= QUALITY_GATE_LOST_CONTACT_POLLS) {
        lostContact = true
        break
      }
    }
    if (pending.size > 0) {
      await sleep(QUALITY_GATE_POLL_MS)
    }
  }

  const runs: QualityGateCliRun[] = []
  for (const entry of started.runs) {
    const known = lastSeen.get(entry.run.id) ?? entry.run
    if (lostContact) {
      const stillOpen = pending.has(entry.run.id)
      runs.push({
        run: stillOpen ? unobserved(known) : known,
        started: entry.started,
        stdout: '',
        stderr: ''
      })
      continue
    }
    try {
      const output = await call<QualityGateRunOutput>('qualityGates.output', {
        worktree,
        runId: entry.run.id
      })
      runs.push({ ...output.result, started: entry.started })
    } catch (error) {
      if (!isLostContact(error)) {
        throw error
      }
      runs.push({ run: unobserved(known), started: entry.started, stdout: '', stderr: '' })
    }
  }
  return { outcome: qualityGateRunOutcome(runs.map((entry) => entry.run)), runs }
}
