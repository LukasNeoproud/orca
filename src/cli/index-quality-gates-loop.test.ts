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

import type { QualityGateFeedbackLoopStatus } from '../shared/quality-gate-feedback-loop'
import { main } from './index'
import { useWorktreeAwarenessEnvironment } from './index-test-harness'
import {
  GATE_WORKTREE as worktree,
  LINT_GATE as lint,
  gateRunView
} from './quality-gate-cli-test-fixtures'
import { formatQualityGateFeedbackLoop } from './quality-gate-feedback-loop-format'
import { RuntimeClientError } from './runtime/types'
import { COMMAND_SPECS } from './specs'
import { okFixture } from './test-fixtures'

const loop = (
  overrides: Partial<QualityGateFeedbackLoopStatus> = {}
): QualityGateFeedbackLoopStatus => ({
  enabled: true,
  repoEnabled: true,
  workspaceDisabled: false,
  maxRounds: 3,
  state: 'idle',
  round: 0,
  failingGateIds: [],
  ...overrides
})

function mockHost(feedbackLoop?: QualityGateFeedbackLoopStatus) {
  callMock.mockImplementation(async (method: string, params: { enabled?: boolean }) => {
    switch (method) {
      case 'qualityGates.status':
        return okFixture('status', {
          repoId: 'repo',
          worktreeId: 'repo::/tmp/api',
          worktreePath: '/tmp/api',
          source: { head: 'a'.repeat(40), clean: true, fingerprint: 'f0' },
          gates: [{ gate: lint, latestRun: gateRunView(lint) }],
          ...(feedbackLoop ? { feedbackLoop } : {})
        })
      case 'qualityGates.setFeedbackLoop':
        return okFixture('loop', {
          feedbackLoop: loop({
            enabled: params.enabled === true,
            workspaceDisabled: params.enabled !== true,
            state: 'stopped',
            stopReason: 'disabled'
          })
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

describe('gates loop', () => {
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

  it('turns the loop off for the workspace and says so', async () => {
    mockHost()
    await main(['gates', 'loop', 'off', '--worktree', worktree], '/tmp/api')
    expect(callMock).toHaveBeenCalledWith('qualityGates.setFeedbackLoop', {
      worktree,
      enabled: false
    })
    expect(printed()).toBe('Feedback loop: off for this workspace.')
  })

  it('prints the loop as JSON for a script', async () => {
    mockHost()
    await main(['gates', 'loop', 'off', '--worktree', worktree, '--json'], '/tmp/api')
    expect(JSON.parse(printed()).result.feedbackLoop).toMatchObject({
      enabled: false,
      workspaceDisabled: true
    })
  })

  it('refuses anything but on or off before calling the host', async () => {
    mockHost()
    await main(['gates', 'loop', '--worktree', worktree], '/tmp/api')
    await main(['gates', 'loop', 'pause', '--worktree', worktree], '/tmp/api')
    expect(callMock.mock.calls.map((call) => call[0])).not.toContain('qualityGates.setFeedbackLoop')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('orca gates loop off'))
  })

  it('has no flag that turns the loop on for a repository or changes its round limit', () => {
    const spec = COMMAND_SPECS.find((candidate) => candidate.path.join(' ') === 'gates loop')
    expect(spec?.allowedFlags).not.toContain('rounds')
    expect(spec?.allowedFlags).not.toContain('repo')
    expect(spec?.usage).toBe('orca gates loop off [--worktree <selector>] [--json]')
  })

  it('tells the user to update a host from before the loop', async () => {
    mockHost()
    callMock.mockRejectedValue(new RuntimeClientError('method_not_found', 'Unknown method'))
    await main(['gates', 'loop', 'off', '--worktree', worktree], '/tmp/api')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Update Orca'))
  })

  it('adds the loop to gates status, and nothing for a host that reports none', async () => {
    mockHost(loop({ state: 'needs-user', round: 3, stopReason: 'round-limit' }))
    await main(['gates', 'status', '--worktree', worktree], '/tmp/api')
    expect(printed().split('\n').at(-1)).toBe(
      'Feedback loop: on, failures are waiting for you: the round limit was reached.'
    )

    vi.mocked(console.log).mockClear()
    mockHost()
    await main(['gates', 'status', '--worktree', worktree], '/tmp/api')
    expect(printed()).not.toContain('Feedback loop')
    expect(printed().split('\n')).toHaveLength(1)
  })

  it('words every state, and a reason it does not know as none', () => {
    expect(formatQualityGateFeedbackLoop(loop({ repoEnabled: false, enabled: false }))).toBe(
      'Feedback loop: off (turned on per repository in the Orca app).'
    )
    expect(formatQualityGateFeedbackLoop(loop())).toBe(
      'Feedback loop: on, no agent step checked yet.'
    )
    expect(formatQualityGateFeedbackLoop(loop({ state: 'awaiting-agent', round: 2 }))).toBe(
      'Feedback loop: on, failures sent to the agent, round 2 of 3.'
    )
    expect(formatQualityGateFeedbackLoop(loop({ state: 'stopped', stopReason: 'later' }))).toBe(
      'Feedback loop: on, stopped.'
    )
    expect(formatQualityGateFeedbackLoop({ state: 'unknown-state' })).toBeNull()
  })
})
