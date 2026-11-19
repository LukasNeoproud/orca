import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QualityGateDefinition, QualityGateSourceState } from '../../shared/quality-gate-types'
import type { QualityGateCommandResult } from './quality-gate-command-run'
import { createQualityGateRunStore } from './quality-gate-run-store'
import { createQualityGateService, type QualityGateServiceDeps } from './quality-gate-service'
import type { QualityGateTarget } from './quality-gate-target'

const lint: QualityGateDefinition = {
  id: 'lint',
  name: 'Lint',
  command: 'echo lint',
  required: true,
  timeoutSeconds: 60
}
const tests: QualityGateDefinition = { ...lint, id: 'test', name: 'Tests', command: 'echo test' }

const PASSED: QualityGateCommandResult = {
  status: 'passed',
  exitCode: 0,
  stdout: 'ok\n',
  stderr: '',
  outputTruncated: false,
  error: null
}

type PendingCommand = {
  command: string
  signal: AbortSignal
  finish: (result: QualityGateCommandResult) => void
}

describe('quality gate service', () => {
  let dir: string
  let filePath: string
  let pending: PendingCommand[]
  let source: QualityGateSourceState
  let clock: number

  function target(overrides: Partial<QualityGateTarget> = {}): QualityGateTarget {
    return {
      repoId: 'repo',
      worktreeId: 'repo::/work',
      worktreePath: '/work',
      gates: [lint, tests],
      feedbackLoop: { enabled: false, maxRounds: 3 },
      launch: { kind: 'native', cwd: '/work' },
      source: { path: '/work', git: true },
      ...overrides
    }
  }

  function service(hostInstanceId = 'host-a', overrides: Partial<QualityGateServiceDeps> = {}) {
    let nextId = 0
    return createQualityGateService({
      store: createQualityGateRunStore({ filePath, now: () => clock }),
      hostInstanceId,
      runCommand: vi.fn(
        ({ command, signal }) =>
          new Promise<QualityGateCommandResult>((resolve) => {
            const finish = (result: QualityGateCommandResult): void => resolve(result)
            signal.addEventListener('abort', () =>
              finish({ ...PASSED, status: 'cancelled', exitCode: null, stdout: 'partial\n' })
            )
            pending.push({ command, signal, finish })
          })
      ),
      readSource: vi.fn(async () => source),
      runnerDirectory: join(dir, 'runners'),
      now: () => ++clock,
      newRunId: () => `${hostInstanceId}-run-${++nextId}`,
      ...overrides
    })
  }

  async function nextCommand(count = 1): Promise<PendingCommand> {
    await expect.poll(() => pending.length).toBe(count)
    return pending[count - 1]
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orca-gate-service-'))
    filePath = join(dir, 'quality-gate-runs.json')
    pending = []
    source = { head: 'aaa', clean: true, fingerprint: 'f0' }
    clock = 1_000
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('lists the gates of the settings, in their order', () => {
    expect(service().list(target())).toEqual({
      repoId: 'repo',
      worktreeId: 'repo::/work',
      gates: [lint, tests]
    })
  })

  it('runs the gates one after another and records who started them on which commit', async () => {
    const gates = service()
    const started = gates.run(target(), undefined, { kind: 'local-cli' })
    expect(started.runs.map(({ run, started: fresh }) => [run.gateId, run.status, fresh])).toEqual([
      ['lint', 'queued', true],
      ['test', 'queued', true]
    ])

    const first = await nextCommand()
    expect(first.command).toBe('echo lint')
    expect((await gates.status(target())).gates.map((entry) => entry.latestRun?.status)).toEqual([
      'running',
      'queued'
    ])
    first.finish({ ...PASSED, status: 'failed', exitCode: 2, stderr: 'boom\n' })

    const second = await nextCommand(2)
    expect(second.command).toBe('echo test')
    second.finish(PASSED)
    await gates.whenIdle('repo::/work')

    const status = await gates.status(target())
    expect(status.source).toEqual(source)
    expect(status.gates[0].latestRun).toMatchObject({
      gateId: 'lint',
      gate: { name: 'Lint', command: 'echo lint', required: true, timeoutSeconds: 60 },
      repoId: 'repo',
      worktreeId: 'repo::/work',
      worktreePath: '/work',
      startedBy: { kind: 'local-cli' },
      source: { head: 'aaa', clean: true, fingerprint: 'f0' },
      status: 'failed',
      exitCode: 2,
      liveness: 'exited',
      freshness: { state: 'current' }
    })
    expect(status.gates[1].latestRun).toMatchObject({ status: 'passed', exitCode: 0 })
    expect(status.gates[0].latestRun).not.toHaveProperty('stdout')
    expect(status.gates[0].latestRun).not.toHaveProperty('hostInstanceId')
  })

  it('does not start a second run of a gate that is still live in the worktree', async () => {
    const deps = { runCommand: vi.fn(() => new Promise<QualityGateCommandResult>(() => {})) }
    const gates = service('host-a', deps)
    const first = gates.run(target(), ['lint'], { kind: 'desktop' })
    await expect.poll(() => deps.runCommand.mock.calls.length).toBe(1)

    const again = gates.run(target(), ['lint'], { kind: 'local-cli' })
    expect(again.runs).toHaveLength(1)
    expect(again.runs[0].started).toBe(false)
    expect(again.runs[0].run.id).toBe(first.runs[0].run.id)
    expect(again.runs[0].run.startedBy).toEqual({ kind: 'desktop' })

    const elsewhere = gates.run(target({ worktreeId: 'repo::/second' }), ['lint'], {
      kind: 'desktop'
    })
    expect(elsewhere.runs[0].started).toBe(true)
    await expect.poll(() => deps.runCommand.mock.calls.length).toBe(2)
  })

  it('cancels the running gate and the queued one without ever starting the latter', async () => {
    const gates = service()
    gates.run(target(), undefined, { kind: 'desktop' })
    const running = await nextCommand()

    const result = await gates.cancel(target(), {})
    expect(running.signal.aborted).toBe(true)
    expect(result.cancelled.map((run) => [run.gateId, run.status, run.liveness])).toEqual([
      ['lint', 'cancelled', 'exited'],
      ['test', 'cancelled', 'exited']
    ])
    await gates.whenIdle('repo::/work')
    expect(pending).toHaveLength(1)
    expect((await gates.status(target())).gates.map((entry) => entry.latestRun?.status)).toEqual([
      'cancelled',
      'cancelled'
    ])
  })

  it('cancels only the named gate', async () => {
    const gates = service()
    gates.run(target(), undefined, { kind: 'desktop' })
    const running = await nextCommand()

    const result = await gates.cancel(target(), { gateId: 'test' })
    expect(result.cancelled.map((run) => run.gateId)).toEqual(['test'])
    expect(running.signal.aborted).toBe(false)
    running.finish(PASSED)
    await gates.whenIdle('repo::/work')
    expect(pending).toHaveLength(1)
  })

  it('reports a result as stale after another commit, an edit, or a changed command', async () => {
    const gates = service()
    gates.run(target(), ['lint'], { kind: 'desktop' })
    ;(await nextCommand()).finish(PASSED)
    await gates.whenIdle('repo::/work')
    const freshness = async (definition = lint) =>
      (await gates.status(target({ gates: [definition] }))).gates[0].latestRun?.freshness

    expect(await freshness()).toEqual({ state: 'current' })
    source = { head: 'bbb', clean: true, fingerprint: 'f0' }
    expect(await freshness()).toEqual({ state: 'stale', reasons: ['head-changed'] })
    source = { head: 'aaa', clean: false, fingerprint: 'f1' }
    expect(await freshness()).toEqual({ state: 'stale', reasons: ['tree-changed'] })
    source = { head: 'aaa', clean: true, fingerprint: 'f0' }
    expect(await freshness({ ...lint, command: 'echo other' })).toEqual({
      state: 'stale',
      reasons: ['gate-changed']
    })
  })

  it('runs a gate in a folder workspace without git, tied to no commit', async () => {
    source = { head: null, clean: null, fingerprint: null }
    const folder = target({ source: { path: '/work', git: false } })
    const gates = service()
    gates.run(folder, ['lint'], { kind: 'desktop' })
    ;(await nextCommand()).finish(PASSED)
    await gates.whenIdle('repo::/work')

    expect((await gates.status(folder)).gates[0].latestRun).toMatchObject({
      status: 'passed',
      source: { head: null, clean: null, fingerprint: null },
      freshness: { state: 'unlinked' }
    })
  })

  it('returns the output tail of a run, and only to its own worktree', async () => {
    const gates = service()
    const { runs } = gates.run(target(), ['lint'], { kind: 'desktop' })
    ;(await nextCommand()).finish({ ...PASSED, stdout: 'checked 3 files\n', stderr: 'warn\n' })
    await gates.whenIdle('repo::/work')

    expect(await gates.output(target(), runs[0].run.id)).toMatchObject({
      run: { id: runs[0].run.id, status: 'passed', freshness: { state: 'current' } },
      stdout: 'checked 3 files\n',
      stderr: 'warn\n'
    })
    await expect(
      gates.output(target({ worktreeId: 'repo::/second' }), runs[0].run.id)
    ).rejects.toThrow('was not found for this workspace')
    await expect(gates.output(target(), 'missing')).rejects.toThrow(
      'was not found for this workspace'
    )
  })

  it('refuses a gate the settings do not hold and starts nothing', () => {
    const gates = service()
    expect(() => gates.run(target(), ['lint', 'deploy'], { kind: 'local-cli' })).toThrow(
      'Quality gate "deploy" is not set up'
    )
    expect(pending).toHaveLength(0)
  })

  it('records a runner that threw as not started', async () => {
    const gates = service('host-a', {
      runCommand: vi.fn(async () => {
        throw new Error('spawn exploded')
      })
    })
    gates.run(target(), ['lint'], { kind: 'desktop' })
    await gates.whenIdle('repo::/work')

    expect((await gates.status(target())).gates[0].latestRun).toMatchObject({
      status: 'not-started',
      error: 'spawn exploded',
      liveness: 'exited'
    })
  })

  it('shows a run whose host process is gone as unverifiable, never as failed', async () => {
    const before = service('host-a')
    before.run(target(), ['lint'], { kind: 'desktop' })
    await nextCommand()

    // A restarted host: the same file, a new process, and no handle on the old command.
    const after = service('host-b')
    const run = (await after.status(target())).gates[0].latestRun
    expect(run).toMatchObject({
      status: 'unverifiable',
      liveness: 'unverifiable',
      exitCode: null,
      freshness: null
    })
    expect(run?.error).toContain('not observed')

    // The gate can be run again; the old record does not count as a live duplicate.
    const again = after.run(target(), ['lint'], { kind: 'desktop' })
    expect(again.runs[0].started).toBe(true)
  })
})
