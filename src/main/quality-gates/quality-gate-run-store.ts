import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import {
  qualityGateRunLiveness,
  type QualityGateRun,
  type QualityGateRunStatus
} from '../../shared/quality-gate-types'
import { durableWriteTempPath, writeFileDurableSync } from '../durable-file-write'

/**
 * A run as the owning host keeps it. `hostInstanceId` names the process that started the command:
 * only that process can say whether a live run is still running.
 */
export type StoredQualityGateRun = QualityGateRun & {
  hostInstanceId: string
  stdout: string
  stderr: string
}

type RunFile = { version: 1; runs: StoredQualityGateRun[] }

export const QUALITY_GATE_RUN_RETENTION = {
  finishedPerGate: 5,
  finishedMaxAgeMs: 30 * 24 * 60 * 60_000,
  // A live record this old outlived every time limit; whoever owned it is not coming back.
  liveMaxAgeMs: 7 * 24 * 60 * 60_000,
  maxRuns: 300
} as const

const STATUS_LIST: readonly QualityGateRunStatus[] = [
  'queued',
  'running',
  'passed',
  'failed',
  'timed-out',
  'not-started',
  'cancelled',
  'unverifiable'
]
const STATUSES: ReadonlySet<string> = new Set(STATUS_LIST)

function isStoredRun(value: unknown): value is StoredQualityGateRun {
  if (!value || typeof value !== 'object') {
    return false
  }
  const read = (key: keyof StoredQualityGateRun): unknown => Reflect.get(value, key)
  const gate = read('gate')
  const status = read('status')
  const strings: (keyof StoredQualityGateRun)[] = [
    'id',
    'gateId',
    'repoId',
    'worktreeId',
    'worktreePath',
    'hostInstanceId',
    'stdout',
    'stderr'
  ]
  return (
    strings.every((key) => typeof read(key) === 'string') &&
    typeof read('requestedAt') === 'number' &&
    typeof status === 'string' &&
    STATUSES.has(status) &&
    gate !== null &&
    typeof gate === 'object' &&
    typeof Reflect.get(gate, 'command') === 'string'
  )
}

function isLive(run: StoredQualityGateRun): boolean {
  return qualityGateRunLiveness(run.status) === 'live'
}

function settledAt(run: StoredQualityGateRun): number {
  return run.finishedAt ?? run.startedAt ?? run.requestedAt
}

/** Exported for the retention test. */
export function pruneQualityGateRuns(
  runs: readonly StoredQualityGateRun[],
  now: number
): StoredQualityGateRun[] {
  const fresh = runs.filter((run) =>
    isLive(run)
      ? now - run.requestedAt <= QUALITY_GATE_RUN_RETENTION.liveMaxAgeMs
      : now - settledAt(run) <= QUALITY_GATE_RUN_RETENTION.finishedMaxAgeMs
  )
  const newestFirst = [...fresh].sort((a, b) => b.requestedAt - a.requestedAt)
  const keptPerGate = new Map<string, number>()
  const kept = new Set<string>()
  for (const run of newestFirst) {
    if (isLive(run)) {
      kept.add(run.id)
      continue
    }
    if (kept.size >= QUALITY_GATE_RUN_RETENTION.maxRuns) {
      continue
    }
    const key = `${run.worktreeId}\0${run.gateId}`
    const count = keptPerGate.get(key) ?? 0
    if (count < QUALITY_GATE_RUN_RETENTION.finishedPerGate) {
      keptPerGate.set(key, count + 1)
      kept.add(run.id)
    }
  }
  return fresh.filter((run) => kept.has(run.id))
}

export type QualityGateRunStore = {
  list(worktreeId?: string): StoredQualityGateRun[]
  get(id: string): StoredQualityGateRun | null
  put(run: StoredQualityGateRun): void
}

export function defaultQualityGateRunStorePath(): string {
  return join(getAppEnvironment().getPath('userData'), 'quality-gate-runs.json')
}

/**
 * Why every call reads the file: two Orca builds can share one data directory, and each keeps
 * only its own runs in memory. Reading before writing keeps the other build's records.
 */
export function createQualityGateRunStore(options: {
  filePath: string
  now?: () => number
}): QualityGateRunStore {
  const now = options.now ?? Date.now

  function load(): StoredQualityGateRun[] {
    if (!existsSync(options.filePath)) {
      return []
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(options.filePath, 'utf-8'))
      const runs: unknown =
        parsed && typeof parsed === 'object' ? Reflect.get(parsed, 'runs') : null
      return Array.isArray(runs) ? runs.filter(isStoredRun) : []
    } catch {
      return []
    }
  }

  return {
    list: (worktreeId) =>
      load().filter((run) => worktreeId === undefined || run.worktreeId === worktreeId),
    get: (id) => load().find((run) => run.id === id) ?? null,
    put: (run) => {
      const others = load().filter((existing) => existing.id !== run.id)
      const file: RunFile = { version: 1, runs: pruneQualityGateRuns([...others, run], now()) }
      mkdirSync(dirname(options.filePath), { recursive: true })
      writeFileDurableSync(
        durableWriteTempPath(options.filePath),
        options.filePath,
        JSON.stringify(file)
      )
    }
  }
}
