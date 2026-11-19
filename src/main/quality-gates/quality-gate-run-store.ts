import { mkdirSync, readFileSync, statSync } from 'node:fs'
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

/** A run read from the file before any of its fields is checked. */
type UncheckedStoredRun = { [K in keyof StoredQualityGateRun]?: unknown }

function isStoredRun(value: unknown): value is StoredQualityGateRun {
  if (!value || typeof value !== 'object') {
    return false
  }
  const unchecked: UncheckedStoredRun = value
  const gate = unchecked.gate
  const status = unchecked.status
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
    strings.every((key) => typeof unchecked[key] === 'string') &&
    typeof unchecked.requestedAt === 'number' &&
    typeof status === 'string' &&
    STATUSES.has(status) &&
    gate !== null &&
    typeof gate === 'object' &&
    'command' in gate &&
    typeof gate.command === 'string'
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
 * Why every call looks at the file: two Orca builds can share one data directory, and each keeps
 * only its own runs in memory. Reading before writing keeps the other build's records. The file
 * is parsed again only after it changed; with 300 runs it is megabytes of JSON.
 */
export function createQualityGateRunStore(options: {
  filePath: string
  now?: () => number
  /** For tests: counts how often the file is really read. */
  readText?: (filePath: string) => string
}): QualityGateRunStore {
  const now = options.now ?? Date.now
  const readText = options.readText ?? ((filePath: string) => readFileSync(filePath, 'utf-8'))
  /** The last parse and the file it was made from. Its runs are shared with callers: read only. */
  let parsed: { identity: string; runs: StoredQualityGateRun[] } | null = null

  /** Changes with every write: each one renames a new file into place. Null when there is none. */
  function fileIdentity(): string | null {
    try {
      const stats = statSync(options.filePath, { bigint: true })
      return `${stats.ino}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}`
    } catch {
      return null
    }
  }

  function load(): StoredQualityGateRun[] {
    const identity = fileIdentity()
    if (identity === null) {
      return []
    }
    if (parsed?.identity === identity) {
      return parsed.runs
    }
    let runs: StoredQualityGateRun[] = []
    try {
      const content: unknown = JSON.parse(readText(options.filePath))
      const stored: unknown =
        content && typeof content === 'object' && 'runs' in content ? content.runs : null
      runs = Array.isArray(stored) ? stored.filter(isStoredRun) : []
    } catch {
      // Unreadable or foreign: read as empty, as before.
    }
    parsed = { identity, runs }
    return runs
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
      // Not kept from memory: `run` is the caller's live object, and another build may write next.
      parsed = null
    }
  }
}
