import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QualityGateDefinition, QualityGateRunView } from '../../shared/quality-gate-types'
import type { QualityGateCommandResult } from './quality-gate-command-run'
import { createQualityGateRunStore } from './quality-gate-run-store'
import {
  QUALITY_GATE_STOPPED_BY_QUIT,
  createQualityGateService,
  type QualityGateServiceDeps
} from './quality-gate-service'
import type { QualityGateTarget } from './quality-gate-target'

const lint: QualityGateDefinition = {
  id: 'lint',
  name: 'Lint',
  command: 'echo lint',
  required: true,
  timeoutSeconds: 60
}
const tests: QualityGateDefinition = { ...lint, id: 'test', name: 'Tests', command: 'echo test' }
const RESULT: QualityGateCommandResult = {
  status: 'passed',
  exitCode: 0,
  stdout: '',
  stderr: '',
  outputTruncated: false,
  error: null
}
const target: QualityGateTarget = {
  repoId: 'repo',
  worktreeId: 'repo::/work',
  worktreePath: '/work',
  gates: [lint, tests],
  launch: { kind: 'native', cwd: '/work' },
  source: { path: '/work', git: true }
}

describe('quality gate service: stopped runs and change reports', () => {
  let dir: string
  let finish: ((result: QualityGateCommandResult) => void)[]

  function service(overrides: Partial<QualityGateServiceDeps> = {}) {
    let clock = 1_000
    let nextId = 0
    return createQualityGateService({
      store: createQualityGateRunStore({ filePath: join(dir, 'runs.json'), now: () => clock }),
      hostInstanceId: 'host-a',
      runCommand: vi.fn(
        ({ signal }) =>
          new Promise<QualityGateCommandResult>((resolve) => {
            signal.addEventListener('abort', () =>
              resolve({ ...RESULT, status: 'cancelled', exitCode: null })
            )
            finish.push(resolve)
          })
      ),
      readSource: vi.fn(async () => ({ head: 'aaa', clean: true, fingerprint: 'f0' })),
      runnerDirectory: join(dir, 'runners'),
      now: () => ++clock,
      newRunId: () => `run-${++nextId}`,
      ...overrides
    })
  }

  async function latest(gates: ReturnType<typeof service>): Promise<(QualityGateRunView | null)[]> {
    return (await gates.status(target)).gates.map((entry) => entry.latestRun)
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orca-gate-changes-'))
    finish = []
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports every step of a run to the change feed: queued, running, finished', async () => {
    const onRunChanged = vi.fn()
    const gates = service({ onRunChanged })

    gates.run(target, ['lint'], { kind: 'desktop' })
    expect(onRunChanged).toHaveBeenCalledTimes(1)
    await expect.poll(() => finish.length).toBe(1)
    expect(onRunChanged).toHaveBeenCalledTimes(2)
    finish[0](RESULT)
    await gates.whenIdle('repo::/work')

    expect(onRunChanged).toHaveBeenCalledTimes(3)
    expect(new Set(onRunChanged.mock.calls.map(([worktreeId]) => worktreeId))).toEqual(
      new Set(['repo::/work'])
    )
  })

  it('gives a run stopped on request no freshness: it checked nothing', async () => {
    const onRunChanged = vi.fn()
    const gates = service({ onRunChanged })
    gates.run(target, undefined, { kind: 'desktop' })
    await expect.poll(() => finish.length).toBe(1)
    onRunChanged.mockClear()

    await gates.cancel(target, {})
    await gates.whenIdle('repo::/work')

    expect(await latest(gates)).toMatchObject([
      // Stopped while running, and stopped while still queued.
      { status: 'cancelled', liveness: 'exited', stopReason: 'requested', freshness: null },
      { status: 'cancelled', startedAt: null, stopReason: 'requested', freshness: null }
    ])
    expect(onRunChanged).toHaveBeenCalledTimes(2)
  })

  it('names quit as the stop reason and keeps the text an older client shows', async () => {
    const gates = service()
    gates.run(target, undefined, { kind: 'desktop' })
    await expect.poll(() => finish.length).toBe(1)

    await gates.shutdown()

    for (const run of await latest(gates)) {
      expect(run).toMatchObject({
        status: 'cancelled',
        stopReason: 'app-quit',
        error: QUALITY_GATE_STOPPED_BY_QUIT,
        freshness: null
      })
    }
  })

  it('keeps freshness for a run with a result and drops it for one that never started', async () => {
    const gates = service()
    gates.run(target, undefined, { kind: 'desktop' })
    await expect.poll(() => finish.length).toBe(1)
    finish[0](RESULT)
    await expect.poll(() => finish.length).toBe(2)
    finish[1]({ ...RESULT, status: 'not-started', exitCode: 127, error: 'command not found' })
    await gates.whenIdle('repo::/work')

    const [passed, notStarted] = await latest(gates)
    expect(passed).toMatchObject({ status: 'passed', freshness: { state: 'current' } })
    expect(passed).not.toHaveProperty('stopReason')
    expect(notStarted).toMatchObject({ status: 'not-started', freshness: null })
  })
})
