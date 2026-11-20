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

import { azureDevOpsReviewExecutionRefusal } from '../shared/azure-devops-review-depth-execution'
import { COMMAND_SPECS } from './specs'
import { main } from './index'
import { useWorktreeAwarenessEnvironment } from './index-test-harness'
import { RuntimeClientError } from './runtime/types'
import { GATE_WORKTREE, LINT_GATE, TEST_GATE, gateRunView } from './quality-gate-cli-test-fixtures'
import { buildWorktree, okFixture, worktreeListFixture } from './test-fixtures'

const lint = LINT_GATE
const tests = TEST_GATE
const worktree = GATE_WORKTREE
const runView = gateRunView

function mockHost(runs = [runView(lint), runView(tests, { status: 'failed', exitCode: 4 })]) {
  callMock.mockImplementation(async (method: string, params: { runId?: string }) => {
    switch (method) {
      case 'worktree.list':
        return worktreeListFixture([buildWorktree('/tmp/api', 'api')])
      case 'qualityGates.list':
        return okFixture('list', {
          repoId: 'repo',
          worktreeId: 'repo::/tmp/api',
          gates: [lint, tests]
        })
      case 'qualityGates.run':
        return okFixture('run', {
          runs: runs.map((run) => ({
            run: { ...run, status: 'queued', liveness: 'live' },
            started: true
          }))
        })
      case 'qualityGates.status':
        return okFixture('status', {
          repoId: 'repo',
          worktreeId: 'repo::/tmp/api',
          worktreePath: '/tmp/api',
          source: { head: 'a'.repeat(40), clean: true, fingerprint: 'f0' },
          gates: [lint, tests].map((gate) => ({
            gate,
            latestRun: runs.find((run) => run.gateId === gate.id) ?? null
          }))
        })
      case 'qualityGates.output':
        return okFixture('output', {
          run: runs.find((run) => run.id === params.runId),
          stdout: `output of ${params.runId}\n`,
          stderr: ''
        })
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

describe('gates CLI', () => {
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

  it('lists the gates of the workspace', async () => {
    mockHost()
    await main(['gates', 'list', '--worktree', worktree], '/tmp/api')
    expect(callMock).toHaveBeenCalledWith('qualityGates.list', { worktree })
    expect(printed()).toBe(
      'lint\tLint\trequired\tlimit 60s\techo lint\ntest\tUnit tests\toptional\tlimit 60s\texit 4'
    )
  })

  it('uses the workspace that contains the current directory when none is named', async () => {
    mockHost()
    await main(['gates', 'status', '--json'], '/tmp/api')
    expect(methods()).toEqual(['worktree.list', 'qualityGates.status'])
    expect(callMock).toHaveBeenLastCalledWith('qualityGates.status', { worktree })
    expect(JSON.parse(printed()).result.gates).toHaveLength(2)
  })

  it('runs every gate, waits and prints result, exit code and the end of the output', async () => {
    mockHost()
    await main(['gates', 'run', '--worktree', worktree], '/tmp/api')

    expect(callMock).toHaveBeenCalledWith('qualityGates.run', { worktree })
    const text = printed()
    expect(text).toContain('passed\tlint\tLint\trequired\texit 0\t1.5s\tcommit aaaaaaaaaa\tcurrent')
    expect(text).toContain('failed\ttest\tUnit tests\toptional\texit 4')
    expect(text).toContain('  stdout:\n    output of run-test')
    // The failed gate is optional, so the required set still passed.
    expect(text).toContain('Every required gate passed.')
    expect(process.exitCode).toBeUndefined()
  })

  it('exits 1 with the whole result as JSON when a required gate did not pass', async () => {
    mockHost([runView(lint, { status: 'timed-out', exitCode: null }), runView(tests)])
    await main(['gates', 'run', '--worktree', worktree, '--json'], '/tmp/api')

    const result = JSON.parse(printed()).result
    expect(result.outcome).toBe('failed')
    expect(result.runs.map((entry: { run: { status: string } }) => entry.run.status)).toEqual([
      'timed-out',
      'passed'
    ])
    expect(result.runs[0]).toMatchObject({ started: true, stdout: 'output of run-lint\n' })
    expect(process.exitCode).toBe(1)
  })

  it('names gates by id or by name and sends only ids', async () => {
    mockHost()
    await main(['gates', 'run', 'unit tests', 'lint', '--worktree', worktree], '/tmp/api')
    expect(callMock).toHaveBeenCalledWith('qualityGates.run', {
      worktree,
      gateIds: ['test', 'lint']
    })
  })

  it('refuses a gate that is not set up before starting anything', async () => {
    mockHost()
    await main(['gates', 'run', 'deploy', '--worktree', worktree], '/tmp/api')
    expect(methods()).not.toContain('qualityGates.run')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('No quality gate "deploy"'))
  })

  it('prints why the host runs nothing in a static review and exits 1', async () => {
    mockHost()
    const answer = callMock.getMockImplementation()
    callMock.mockImplementation(async (method: string, params: unknown) => {
      if (method === 'qualityGates.run') {
        throw new RuntimeClientError('runtime_error', azureDevOpsReviewExecutionRefusal('static'))
      }
      return answer?.(method, params)
    })
    await main(['gates', 'run', '--worktree', worktree], '/tmp/api')
    expect(callMock).toHaveBeenCalledWith('qualityGates.run', { worktree })
    expect(methods()).not.toContain('qualityGates.output')
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('choose Build or Build and run tests')
    )
    expect(process.exitCode).toBe(1)
  })

  it('has no command or flag that defines a gate', () => {
    const specs = COMMAND_SPECS.filter((spec) => spec.path[0] === 'gates')
    expect(specs.map((spec) => spec.path.join(' ')).sort()).toEqual([
      'gates cancel',
      'gates list',
      'gates loop',
      'gates propose',
      'gates run',
      'gates status'
    ])
    // `gates propose` carries gates as a proposal the host only stores; its own test covers it.
    const flags = new Set(
      specs.filter((spec) => spec.path[1] !== 'propose').flatMap((spec) => spec.allowedFlags)
    )
    for (const flag of ['command', 'name', 'required', 'timeout', 'script', 'file']) {
      expect(flags.has(flag)).toBe(false)
    }
  })

  it('tells the user to update a host that does not know quality gates', async () => {
    mockHost()
    callMock.mockRejectedValue(new RuntimeClientError('method_not_found', 'Unknown method'))
    await main(['gates', 'status', '--worktree', worktree], '/tmp/api')
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('does not support quality gates yet')
    )
  })
})
