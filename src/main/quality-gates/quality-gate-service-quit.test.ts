import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  QUALITY_GATE_UNLINKED_SOURCE,
  type QualityGateDefinition
} from '../../shared/quality-gate-types'
import { runQualityGateCommand, type QualityGateCommandResult } from './quality-gate-command-run'
import {
  _setQualityGateServiceForTests,
  getQualityGateService,
  stopQualityGatesForShutdown
} from './quality-gate-host'
import { createQualityGateRunStore } from './quality-gate-run-store'
import {
  createQualityGateService,
  QUALITY_GATE_STOPPED_BY_QUIT,
  type QualityGateServiceDeps
} from './quality-gate-service'
import type { QualityGateTarget } from './quality-gate-target'

// The shell forks a child, and the child forks a grandchild: a build and its test workers.
const TREE_COMMAND = [
  "bash -c 'sleep 30 & echo $! > grandchild.pid; wait' &",
  'echo $! > child.pid',
  'echo $$ > shell.pid',
  'wait'
].join('\n')

const build: QualityGateDefinition = {
  id: 'build',
  name: 'Build',
  command: TREE_COMMAND,
  required: true,
  timeoutSeconds: 60
}
const tests: QualityGateDefinition = { ...build, id: 'test', name: 'Tests', command: 'echo test' }

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('quality gates when Orca quits', () => {
  let dir: string
  let worktree: string
  let filePath: string

  function target(): QualityGateTarget {
    return {
      repoId: 'repo',
      worktreeId: `repo::${worktree}`,
      worktreePath: worktree,
      gates: [build, tests],
      launch: { kind: 'native', cwd: worktree },
      source: { path: worktree, git: false }
    }
  }

  function service(hostInstanceId: string, overrides: Partial<QualityGateServiceDeps> = {}) {
    let nextId = 0
    return createQualityGateService({
      store: createQualityGateRunStore({ filePath }),
      hostInstanceId,
      runCommand: runQualityGateCommand,
      readSource: vi.fn(async () => QUALITY_GATE_UNLINKED_SOURCE),
      runnerDirectory: join(dir, 'runners'),
      now: Date.now,
      newRunId: () => `${hostInstanceId}-run-${++nextId}`,
      ...overrides
    })
  }

  function readPid(name: string): number {
    return Number(readFileSync(join(worktree, name), 'utf-8').trim())
  }

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'orca-gate-quit-')))
    worktree = join(dir, 'worktree')
    filePath = join(dir, 'quality-gate-runs.json')
    mkdirSync(worktree)
  })

  afterEach(() => {
    _setQualityGateServiceForTests(null)
    rmSync(dir, { recursive: true, force: true })
  })

  it.skipIf(process.platform === 'win32')(
    'stops the running command with its whole tree and records why, before quit goes on',
    async () => {
      const before = service('host-a')
      before.run(target(), undefined, { kind: 'desktop' })
      await expect
        .poll(
          () =>
            ['shell.pid', 'child.pid', 'grandchild.pid'].every((name) =>
              existsSync(join(worktree, name))
            ),
          {
            timeout: 10_000
          }
        )
        .toBe(true)
      const pids = ['shell.pid', 'child.pid', 'grandchild.pid'].map(readPid)
      expect(pids.every(processExists)).toBe(true)

      const startedAt = Date.now()
      expect(await before.shutdown()).toEqual({ unsettled: 0 })
      expect(Date.now() - startedAt).toBeLessThan(5_000)
      expect(pids.filter(processExists)).toEqual([])
      expect(() => before.run(target(), ['test'], { kind: 'desktop' })).toThrow('Orca is quitting')

      // The next start reads the file another process wrote.
      const after = service('host-b')
      const latest = (await after.status(target())).gates.map((entry) => entry.latestRun)
      expect(latest[0]).toMatchObject({
        gateId: 'build',
        status: 'cancelled',
        liveness: 'exited',
        exitCode: null,
        error: QUALITY_GATE_STOPPED_BY_QUIT
      })
      expect(latest[1]).toMatchObject({
        gateId: 'test',
        status: 'cancelled',
        startedAt: null,
        error: QUALITY_GATE_STOPPED_BY_QUIT
      })
    },
    20_000
  )

  it('leaves a run whose end was not observed within the limit unverifiable', async () => {
    const hung = vi.fn(() => new Promise<QualityGateCommandResult>(() => {}))
    const before = service('host-a', { runCommand: hung })
    before.run(target(), ['test'], { kind: 'desktop' })
    await expect.poll(() => hung.mock.calls.length).toBe(1)

    expect(await before.shutdown(20)).toEqual({ unsettled: 1 })

    const run = (await service('host-b').status(target())).gates[1].latestRun
    expect(run).toMatchObject({ status: 'unverifiable', liveness: 'unverifiable', exitCode: null })
    expect(run?.error).not.toBe(QUALITY_GATE_STOPPED_BY_QUIT)
  })

  it('leaves a run that no shutdown reached, as after a crash, unverifiable', async () => {
    const before = service('host-a', {
      runCommand: vi.fn(() => new Promise<QualityGateCommandResult>(() => {}))
    })
    before.run(target(), ['test'], { kind: 'desktop' })
    await expect
      .poll(async () => (await before.status(target())).gates[1].latestRun?.status)
      .toBe('running')

    const run = (await service('host-b').status(target())).gates[1].latestRun
    expect(run).toMatchObject({ status: 'unverifiable', liveness: 'unverifiable' })
  })

  it('stops the host service on quit, and does nothing when no gate ever ran', async () => {
    _setQualityGateServiceForTests(null)
    await expect(stopQualityGatesForShutdown()).resolves.toBeUndefined()

    const gates = service('host-a', {
      runCommand: vi.fn(
        ({ signal }) =>
          new Promise<QualityGateCommandResult>((resolve) =>
            signal.addEventListener('abort', () =>
              resolve({
                status: 'cancelled',
                exitCode: null,
                stdout: '',
                stderr: '',
                outputTruncated: false,
                error: null
              })
            )
          )
      )
    })
    _setQualityGateServiceForTests(gates)
    gates.run(target(), ['test'], { kind: 'desktop' })
    await stopQualityGatesForShutdown()
    expect(getQualityGateService()).toBe(gates)
    expect((await gates.status(target())).gates[1].latestRun).toMatchObject({
      status: 'cancelled',
      error: QUALITY_GATE_STOPPED_BY_QUIT
    })
  })
})
