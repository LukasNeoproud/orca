import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  QUALITY_GATE_RUN_RETENTION,
  createQualityGateRunStore,
  pruneQualityGateRuns,
  type StoredQualityGateRun
} from './quality-gate-run-store'

const DAY = 24 * 60 * 60_000
const NOW = 1_800_000_000_000

function run(overrides: Partial<StoredQualityGateRun> = {}): StoredQualityGateRun {
  return {
    id: 'run-1',
    gateId: 'lint',
    gate: { name: 'Lint', command: 'echo ok', required: true, timeoutSeconds: 60 },
    repoId: 'repo',
    worktreeId: 'repo::/work',
    worktreePath: '/work',
    startedBy: { kind: 'desktop' },
    source: { head: 'aaa', clean: true, fingerprint: 'f0' },
    status: 'passed',
    requestedAt: NOW,
    startedAt: NOW,
    finishedAt: NOW,
    exitCode: 0,
    error: null,
    outputTruncated: false,
    hostInstanceId: 'host-a',
    stdout: 'ok\n',
    stderr: '',
    ...overrides
  }
}

describe('quality gate run store', () => {
  let dir: string
  let filePath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orca-gate-store-'))
    filePath = join(dir, 'nested', 'quality-gate-runs.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps a run across a restart of the host', () => {
    createQualityGateRunStore({ filePath, now: () => NOW }).put(run())

    const afterRestart = createQualityGateRunStore({ filePath, now: () => NOW })
    expect(afterRestart.get('run-1')).toEqual(run())
    expect(afterRestart.list('repo::/work')).toHaveLength(1)
    expect(afterRestart.list('repo::/other')).toEqual([])
  })

  it('replaces a run by id instead of adding a second record', () => {
    const store = createQualityGateRunStore({ filePath, now: () => NOW })
    store.put(run({ status: 'running', finishedAt: null }))
    store.put(run({ status: 'failed', exitCode: 2 }))

    expect(store.list()).toHaveLength(1)
    expect(store.get('run-1')?.status).toBe('failed')
  })

  it('keeps the records of another build that shares the data directory', () => {
    const first = createQualityGateRunStore({ filePath, now: () => NOW })
    const second = createQualityGateRunStore({ filePath, now: () => NOW })
    first.put(run({ id: 'from-first' }))
    second.put(run({ id: 'from-second', hostInstanceId: 'host-b', gateId: 'test' }))
    first.put(run({ id: 'from-first-again', gateId: 'build' }))

    expect(
      second
        .list()
        .map((stored) => stored.id)
        .sort()
    ).toEqual(['from-first', 'from-first-again', 'from-second'])
  })

  it('reads an unreadable or foreign file as empty and drops malformed records', () => {
    const store = createQualityGateRunStore({ filePath: join(dir, 'runs.json'), now: () => NOW })
    writeFileSync(join(dir, 'runs.json'), '{ not json')
    expect(store.list()).toEqual([])

    writeFileSync(
      join(dir, 'runs.json'),
      JSON.stringify({ version: 1, runs: [run(), { id: 'x' }, null, { ...run(), id: 7 }] })
    )
    expect(store.list().map((stored) => stored.id)).toEqual(['run-1'])
  })

  it('prunes on write, so the file does not grow without bound', () => {
    const store = createQualityGateRunStore({ filePath, now: () => NOW })
    for (let index = 0; index < QUALITY_GATE_RUN_RETENTION.finishedPerGate + 3; index++) {
      store.put(run({ id: `run-${index}`, requestedAt: NOW - index * 1000 }))
    }

    const kept = store.list().map((stored) => stored.id)
    expect(kept).toHaveLength(QUALITY_GATE_RUN_RETENTION.finishedPerGate)
    expect(kept).toContain('run-0')
    expect(kept).not.toContain(`run-${QUALITY_GATE_RUN_RETENTION.finishedPerGate}`)
    expect(JSON.parse(readFileSync(filePath, 'utf-8')).version).toBe(1)
  })
})

describe('pruneQualityGateRuns', () => {
  it('drops finished runs past the retention age and keeps recent ones', () => {
    const old = run({
      id: 'old',
      finishedAt: NOW - QUALITY_GATE_RUN_RETENTION.finishedMaxAgeMs - 1
    })
    const recent = run({ id: 'recent', finishedAt: NOW - DAY })
    expect(pruneQualityGateRuns([old, recent], NOW).map((stored) => stored.id)).toEqual(['recent'])
  })

  it('keeps the newest finished runs per gate and worktree', () => {
    const runs = Array.from({ length: 8 }, (_, index) =>
      run({ id: `lint-${index}`, requestedAt: NOW - index })
    )
    const other = run({ id: 'other-worktree', worktreeId: 'repo::/second', requestedAt: NOW - 100 })
    const kept = pruneQualityGateRuns([...runs, other], NOW).map((stored) => stored.id)
    expect(kept).toEqual(['lint-0', 'lint-1', 'lint-2', 'lint-3', 'lint-4', 'other-worktree'])
  })

  it('never counts a live run against the limits, until it outlived every time limit', () => {
    const live = Array.from({ length: 8 }, (_, index) =>
      run({ id: `live-${index}`, status: 'running', finishedAt: null, requestedAt: NOW - index })
    )
    expect(pruneQualityGateRuns(live, NOW)).toHaveLength(8)

    const abandoned = run({
      id: 'abandoned',
      status: 'running',
      finishedAt: null,
      requestedAt: NOW - QUALITY_GATE_RUN_RETENTION.liveMaxAgeMs - 1
    })
    expect(pruneQualityGateRuns([abandoned], NOW)).toEqual([])
  })

  it('caps the total', () => {
    const runs = Array.from({ length: QUALITY_GATE_RUN_RETENTION.maxRuns + 20 }, (_, index) =>
      run({ id: `run-${index}`, gateId: `gate-${index}`, requestedAt: NOW - index })
    )
    const kept = pruneQualityGateRuns(runs, NOW)
    expect(kept).toHaveLength(QUALITY_GATE_RUN_RETENTION.maxRuns)
    expect(kept[0].id).toBe('run-0')
  })
})
