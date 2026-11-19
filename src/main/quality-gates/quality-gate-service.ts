import { errorMessage } from '../../shared/error-message'
import {
  deriveQualityGateFreshness,
  qualityGateRunLiveness,
  type QualityGateCancelResult,
  type QualityGateDefinition,
  type QualityGateListResult,
  type QualityGateRunOutput,
  type QualityGateRunStartResult,
  type QualityGateRunStarter,
  type QualityGateRunView,
  type QualityGateSourceState,
  type QualityGateStatusResult
} from '../../shared/quality-gate-types'
import type { runQualityGateCommand } from './quality-gate-command-run'
import type { QualityGateRunStore, StoredQualityGateRun } from './quality-gate-run-store'
import type { readQualityGateSourceState } from './quality-gate-source-state'
import type { QualityGateTarget } from './quality-gate-target'

export type QualityGateServiceDeps = {
  store: QualityGateRunStore
  /** Names this process; a live record carrying another id belongs to someone who cannot be asked. */
  hostInstanceId: string
  runCommand: typeof runQualityGateCommand
  readSource: typeof readQualityGateSourceState
  runnerDirectory: string
  now: () => number
  newRunId: () => string
}

type LiveRun = { run: StoredQualityGateRun; abort: AbortController; settled: Promise<void> }

const CANCEL_SETTLE_WAIT_MS = 15_000
const OWNER_GONE = 'The Orca process that started this run is gone; its outcome was not observed.'

export type QualityGateService = ReturnType<typeof createQualityGateService>

export function createQualityGateService(deps: QualityGateServiceDeps) {
  const live = new Map<string, LiveRun>()
  // One command at a time per worktree: lint, build and tests fight over the same build directory.
  const queues = new Map<string, Promise<void>>()

  function toView(
    stored: StoredQualityGateRun,
    current: QualityGateSourceState | null,
    definition: QualityGateDefinition | null
  ): QualityGateRunView {
    const { hostInstanceId: _owner, stdout: _stdout, stderr: _stderr, ...run } = stored
    const orphaned = qualityGateRunLiveness(run.status) === 'live' && !live.has(run.id)
    const status = orphaned ? 'unverifiable' : run.status
    const liveness = qualityGateRunLiveness(status)
    return {
      ...run,
      status,
      error: orphaned ? OWNER_GONE : run.error,
      liveness,
      freshness:
        liveness === 'exited' && current
          ? deriveQualityGateFreshness(run, current, definition)
          : null
    }
  }

  function save(run: StoredQualityGateRun): void {
    try {
      deps.store.put(run)
    } catch (error) {
      // The run itself is not undone by a full disk; the live map still answers for it.
      console.error('[quality-gates] could not persist a run:', errorMessage(error))
    }
  }

  async function execute(entry: LiveRun, target: QualityGateTarget): Promise<void> {
    if (!live.has(entry.run.id)) {
      return
    }
    try {
      entry.run.source = await deps.readSource(target.source)
      entry.run.status = 'running'
      entry.run.startedAt = deps.now()
      save(entry.run)
      const result = await deps.runCommand({
        runId: entry.run.id,
        command: entry.run.gate.command,
        timeoutSeconds: entry.run.gate.timeoutSeconds,
        target: target.launch,
        signal: entry.abort.signal,
        runnerDirectory: deps.runnerDirectory
      })
      Object.assign(entry.run, result)
    } catch (error) {
      entry.run.status = 'not-started'
      entry.run.error = errorMessage(error)
    }
    entry.run.finishedAt = deps.now()
    live.delete(entry.run.id)
    save(entry.run)
  }

  function liveRunFor(worktreeId: string, gateId: string): LiveRun | undefined {
    for (const entry of live.values()) {
      if (entry.run.worktreeId === worktreeId && entry.run.gateId === gateId) {
        return entry
      }
    }
    return undefined
  }

  function enqueue(
    target: QualityGateTarget,
    gate: QualityGateDefinition,
    startedBy: QualityGateRunStarter
  ): LiveRun {
    const { id: gateId, ...definition } = gate
    const run: StoredQualityGateRun = {
      id: deps.newRunId(),
      gateId,
      gate: definition,
      repoId: target.repoId,
      worktreeId: target.worktreeId,
      worktreePath: target.worktreePath,
      startedBy,
      source: null,
      status: 'queued',
      requestedAt: deps.now(),
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      error: null,
      outputTruncated: false,
      hostInstanceId: deps.hostInstanceId,
      stdout: '',
      stderr: ''
    }
    const entry: LiveRun = { run, abort: new AbortController(), settled: Promise.resolve() }
    live.set(run.id, entry)
    save(run)
    const previous = queues.get(target.worktreeId) ?? Promise.resolve()
    entry.settled = previous.then(() => execute(entry, target))
    const tail = entry.settled
    queues.set(target.worktreeId, tail)
    void tail.then(() => {
      if (queues.get(target.worktreeId) === tail) {
        queues.delete(target.worktreeId)
      }
    })
    return entry
  }

  /** Stored runs of a worktree, with this process's live copies ahead of the file. */
  function runsFor(worktreeId: string): StoredQualityGateRun[] {
    const runs = new Map(deps.store.list(worktreeId).map((run) => [run.id, run]))
    for (const entry of live.values()) {
      if (entry.run.worktreeId === worktreeId) {
        runs.set(entry.run.id, entry.run)
      }
    }
    return [...runs.values()]
  }

  function storedRun(target: QualityGateTarget, runId: string): StoredQualityGateRun {
    const run = live.get(runId)?.run ?? deps.store.get(runId)
    if (!run || run.worktreeId !== target.worktreeId) {
      throw new Error(`Quality gate run "${runId}" was not found for this workspace.`)
    }
    return run
  }

  return {
    list(target: QualityGateTarget): QualityGateListResult {
      return { repoId: target.repoId, worktreeId: target.worktreeId, gates: target.gates }
    },

    /** Starts the named gates, or all of them, in the order of the settings. Returns at once. */
    run(
      target: QualityGateTarget,
      gateIds: readonly string[] | undefined,
      startedBy: QualityGateRunStarter
    ): QualityGateRunStartResult {
      const selected = gateIds
        ? gateIds.map((gateId) => {
            const gate = target.gates.find((candidate) => candidate.id === gateId)
            if (!gate) {
              throw new Error(`Quality gate "${gateId}" is not set up for this repository.`)
            }
            return gate
          })
        : target.gates
      return {
        runs: selected.map((gate) => {
          const running = liveRunFor(target.worktreeId, gate.id)
          const entry = running ?? enqueue(target, gate, startedBy)
          return { run: toView(entry.run, null, gate), started: !running }
        })
      }
    },

    async status(target: QualityGateTarget): Promise<QualityGateStatusResult> {
      const source = await deps.readSource(target.source)
      const stored = runsFor(target.worktreeId)
      return {
        repoId: target.repoId,
        worktreeId: target.worktreeId,
        worktreePath: target.worktreePath,
        source,
        gates: target.gates.map((gate) => {
          const latest = stored
            .filter((run) => run.gateId === gate.id)
            .reduce<StoredQualityGateRun | null>(
              (newest, run) => (!newest || run.requestedAt >= newest.requestedAt ? run : newest),
              null
            )
          return { gate, latestRun: latest ? toView(latest, source, gate) : null }
        })
      }
    },

    async output(target: QualityGateTarget, runId: string): Promise<QualityGateRunOutput> {
      const run = storedRun(target, runId)
      const definition = target.gates.find((gate) => gate.id === run.gateId) ?? null
      const source =
        qualityGateRunLiveness(run.status) === 'exited'
          ? await deps.readSource(target.source)
          : null
      return { run: toView(run, source, definition), stdout: run.stdout, stderr: run.stderr }
    },

    /** Stops the live runs of a worktree, or the one named by run or gate. */
    async cancel(
      target: QualityGateTarget,
      only: { runId?: string; gateId?: string }
    ): Promise<QualityGateCancelResult> {
      const entries = [...live.values()].filter(
        (entry) =>
          entry.run.worktreeId === target.worktreeId &&
          (only.runId === undefined || entry.run.id === only.runId) &&
          (only.gateId === undefined || entry.run.gateId === only.gateId)
      )
      const stopping: Promise<void>[] = []
      for (const entry of entries) {
        if (entry.run.status === 'queued') {
          entry.run.status = 'cancelled'
          entry.run.finishedAt = deps.now()
          live.delete(entry.run.id)
          save(entry.run)
        } else {
          entry.abort.abort()
          stopping.push(entry.settled)
        }
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        Promise.all(stopping),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, CANCEL_SETTLE_WAIT_MS)
          timer.unref?.()
        })
      ])
      clearTimeout(timer)
      return { cancelled: entries.map((entry) => toView(entry.run, null, null)) }
    },

    /** Resolves once nothing is queued or running for the worktree. For tests and shutdown. */
    async whenIdle(worktreeId: string): Promise<void> {
      await queues.get(worktreeId)
    }
  }
}
