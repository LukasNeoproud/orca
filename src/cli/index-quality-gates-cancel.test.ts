import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  callMock,
  runtimeClientConstructorMock,
  serveOrcaAppMock,
  getDefaultUserDataPathMock,
  addEnvironmentFromPairingCodeMock,
  listEnvironmentsMock,
  spawnMock
} = vi.hoisted(() => ({
  callMock: vi.fn(),
  runtimeClientConstructorMock: vi.fn(),
  serveOrcaAppMock: vi.fn(),
  getDefaultUserDataPathMock: vi.fn(() => '/tmp/orca-user-data'),
  addEnvironmentFromPairingCodeMock: vi.fn(),
  listEnvironmentsMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('./runtime-client', async () => {
  const { createRuntimeClientModuleMock } = await import('./index-test-harness.js')
  return createRuntimeClientModuleMock({
    callMock,
    runtimeClientConstructorMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock
  })
})

vi.mock('./runtime/environments', () => ({
  addEnvironmentFromPairingCode: addEnvironmentFromPairingCodeMock,
  listEnvironments: listEnvironmentsMock,
  removeEnvironment: vi.fn(),
  resolveEnvironment: vi.fn()
}))

vi.mock('child_process', async () => {
  const { createChildProcessModuleMock } = await import('./index-test-harness.js')
  return createChildProcessModuleMock(spawnMock)
})

import { parseArgs, specPaths } from './args'
import { main } from './index'
import { useWorktreeAwarenessEnvironment } from './index-test-harness'
import { RuntimeClientError } from './runtime/types'
import { COMMAND_SPECS } from './specs'
import {
  GATE_WORKTREE as worktree,
  LINT_GATE as lint,
  TEST_GATE as tests,
  gateRunView
} from './quality-gate-cli-test-fixtures'
import { okFixture } from './test-fixtures'

const running = (gate: typeof lint) =>
  gateRunView(gate, {
    status: 'running',
    liveness: 'live',
    finishedAt: null,
    exitCode: null,
    freshness: null
  })
const stopped = (gate: typeof lint) =>
  gateRunView(gate, { status: 'cancelled', exitCode: null, freshness: null })

function mockHost(options: { liveGates?: string[]; settles?: boolean } = {}) {
  const live = new Set(options.liveGates ?? [])
  callMock.mockImplementation(async (method: string, params: { gateId?: string }) => {
    switch (method) {
      case 'qualityGates.list':
        return okFixture('list', {
          repoId: 'repo',
          worktreeId: 'repo::/tmp/api',
          gates: [lint, tests]
        })
      case 'qualityGates.run':
        return okFixture('run', {
          runs: [
            {
              run: gateRunView(lint, {
                status: 'queued',
                liveness: 'live',
                startedAt: null,
                finishedAt: null,
                exitCode: null,
                freshness: null,
                source: null
              }),
              started: true
            },
            { run: running(tests), started: false }
          ]
        })
      case 'qualityGates.cancel': {
        const hit = [lint, tests].filter(
          (gate) => live.has(gate.id) && (params.gateId === undefined || params.gateId === gate.id)
        )
        return okFixture('cancel', {
          cancelled: hit.map((gate) => (options.settles === false ? running(gate) : stopped(gate)))
        })
      }
      default:
        throw new Error(`unexpected ${method}`)
    }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

const printed = (): string =>
  vi
    .mocked(console.log)
    .mock.calls.map((call) => call[0])
    .join('\n')
const methods = (): string[] => callMock.mock.calls.map((call) => call[0])

describe('gates cancel and run --no-wait', () => {
  useWorktreeAwarenessEnvironment({
    callMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock,
    addEnvironmentFromPairingCodeMock,
    listEnvironmentsMock,
    spawnMock
  })

  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('starts the runs without waiting and prints the id of each', async () => {
    mockHost()
    await main(['gates', 'run', '--no-wait', '--worktree', worktree], '/tmp/api')

    expect(methods()).toEqual(['qualityGates.run'])
    const text = printed()
    expect(text).toMatch(/^queued\tlint\tLint\trequired\trun run-lint$/m)
    expect(text).toMatch(/^running\ttest\tUnit tests\toptional\t.*\trun run-test$/m)
    expect(text).toContain('Already running when asked')
    expect(text).toContain('Follow the runs with orca gates status')
    expect(process.exitCode).toBeUndefined()
  })

  it('reads --no-wait before a gate name as a switch, not as its value', async () => {
    mockHost()
    await main(
      ['gates', 'run', '--no-wait', 'unit tests', '--worktree', worktree, '--json'],
      '/tmp/api'
    )

    expect(callMock).toHaveBeenCalledWith('qualityGates.run', { worktree, gateIds: ['test'] })
    expect(methods()).not.toContain('qualityGates.status')
    const result = JSON.parse(printed()).result
    expect(result.runs.map((entry: { run: { id: string } }) => entry.run.id)).toEqual([
      'run-lint',
      'run-test'
    ])
  })

  it('stops every running gate of the workspace and prints what it stopped', async () => {
    mockHost({ liveGates: ['lint', 'test'] })
    await main(['gates', 'cancel', '--worktree', worktree], '/tmp/api')

    expect(callMock).toHaveBeenCalledWith('qualityGates.cancel', { worktree })
    expect(printed()).toBe(
      [
        'Stopped:',
        'cancelled\tlint\tLint\trequired\t1.5s\tcommit aaaaaaaaaa\trun run-lint',
        'cancelled\ttest\tUnit tests\toptional\t1.5s\tcommit aaaaaaaaaa\trun run-test'
      ].join('\n')
    )
    expect(process.exitCode).toBeUndefined()
  })

  it('stops only the gates named, by id or name, with one call each', async () => {
    mockHost({ liveGates: ['lint', 'test'] })
    await main(['gates', 'cancel', 'Unit Tests', '--worktree', worktree, '--json'], '/tmp/api')

    expect(callMock).toHaveBeenCalledWith('qualityGates.cancel', { worktree, gateId: 'test' })
    expect(methods().filter((method) => method === 'qualityGates.cancel')).toHaveLength(1)
    const result = JSON.parse(printed()).result
    expect(result.cancelled.map((run: { gateId: string }) => run.gateId)).toEqual(['test'])
  })

  it('succeeds with a message when nothing was running', async () => {
    mockHost()
    await main(['gates', 'cancel', '--worktree', worktree], '/tmp/api')
    expect(printed()).toBe('No quality gate is running in this workspace. Nothing was stopped.')

    vi.mocked(console.log).mockClear()
    await main(['gates', 'cancel', 'lint', '--worktree', worktree, '--json'], '/tmp/api')
    expect(JSON.parse(printed())).toMatchObject({ ok: true, result: { cancelled: [] } })
    expect(process.exitCode).toBeUndefined()
  })

  it('says so when the host has not confirmed the stop yet', async () => {
    mockHost({ liveGates: ['lint'], settles: false })
    await main(['gates', 'cancel', '--worktree', worktree], '/tmp/api')
    expect(printed()).toContain('has not confirmed that every stopped command ended yet')
  })

  it('refuses a gate that is not set up before stopping anything', async () => {
    mockHost({ liveGates: ['lint'] })
    await main(['gates', 'cancel', 'deploy', '--worktree', worktree], '/tmp/api')
    expect(methods()).not.toContain('qualityGates.cancel')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('No quality gate "deploy"'))
  })

  it.each([
    ['cancel', ['gates', 'cancel', '--worktree', worktree]],
    ['run --no-wait', ['gates', 'run', '--no-wait', '--worktree', worktree]]
  ])('tells the user to update a host without quality gates (%s)', async (_name, argv) => {
    mockHost()
    callMock.mockRejectedValue(new RuntimeClientError('method_not_found', 'Unknown method'))
    await main(argv, '/tmp/api')
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('does not support quality gates yet')
    )
  })

  it('documents both commands in their help', async () => {
    mockHost()
    await main(['gates', 'cancel', '--help'], '/tmp/api')
    await main(['gates', 'run', '--help'], '/tmp/api')
    const text = printed()
    expect(text).toContain('orca gates cancel [<gate>...] [--worktree <selector>] [--json]')
    expect(text).toContain(
      'orca gates run [<gate>...] [--no-wait] [--worktree <selector>] [--json]'
    )
    expect(methods()).toEqual([])
  })

  it('parses --no-wait as a switch wherever it stands', () => {
    const paths = COMMAND_SPECS.flatMap(specPaths)
    expect(parseArgs(['gates', 'run', '--no-wait', 'lint'], paths).flags.get('no-wait')).toBe(true)
    expect(parseArgs(['--no-wait', 'gates', 'run', 'lint'], paths).commandPath).toEqual([
      'gates',
      'run',
      'lint'
    ])
  })
})
