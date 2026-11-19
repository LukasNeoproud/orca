import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QUALITY_GATES_FEEDBACK_LOOP_RUNTIME_CAPABILITY } from '../../../../shared/host-feature-runtime-capabilities'
import { RUNTIME_CAPABILITIES } from '../../../../shared/protocol-version'
import type { QualityGateSetFeedbackLoopResult } from '../../../../shared/quality-gate-feedback-loop'
import type {
  QualityGateDefinition,
  QualityGateStatusResult
} from '../../../../shared/quality-gate-types'
import { runQualityGateCommand } from '../../../quality-gates/quality-gate-command-run'
import {
  createQualityGateFeedbackLoop,
  type QualityGateFeedbackLoop
} from '../../../quality-gates/quality-gate-feedback-loop'
import { _setQualityGateFeedbackLoopForTests } from '../../../quality-gates/quality-gate-feedback-loop-host'
import { createQualityGateFeedbackLoopSwitches } from '../../../quality-gates/quality-gate-feedback-loop-switches'
import {
  _setQualityGateChangeFeedForTests,
  _setQualityGateServiceForTests,
  getQualityGateChangeFeed,
  getQualityGateService
} from '../../../quality-gates/quality-gate-host'
import { createQualityGateRunStore } from '../../../quality-gates/quality-gate-run-store'
import { createQualityGateService } from '../../../quality-gates/quality-gate-service'
import { readQualityGateSourceState } from '../../../quality-gates/quality-gate-source-state'
import { resolveQualityGateTarget } from '../../../quality-gates/quality-gate-target'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RpcResponse } from '../core'
import { RpcDispatcher } from '../dispatcher'
import type { RpcCallerIdentity } from '../rpc-caller-identity'
import { ALL_RPC_METHODS } from './index'

const WORKTREE = 'id:repo::/work'
const failing: QualityGateDefinition = {
  id: 'test',
  name: 'Tests',
  command: 'echo "1 test failed" >&2; exit 4',
  required: true,
  timeoutSeconds: 30
}

describe.skipIf(process.platform === 'win32')('feedback loop over qualityGates RPC', () => {
  let root: string
  let worktree: string
  let repoRow: Record<string, unknown>
  let loop: QualityGateFeedbackLoop
  let delivered: string[]
  const updateRepo = vi.fn()

  function runtime(): OrcaRuntimeService {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the gate methods and repo.update read only the members given here.
    return {
      getRuntimeId: () => 'test-runtime',
      showManagedTerminalWorkspace: async () => ({
        id: 'repo::/work',
        repoId: 'repo',
        path: worktree,
        hostId: 'local'
      }),
      listRepos: () => [repoRow],
      resolveProjectRuntimeForWorktree: () => undefined,
      updateRepo
    } as unknown as OrcaRuntimeService
  }

  function call(
    method: string,
    params: unknown,
    caller?: RpcCallerIdentity,
    methods = ALL_RPC_METHODS
  ): Promise<RpcResponse> {
    return new RpcDispatcher({ runtime: runtime(), methods }).dispatch(
      { id: 'req', authToken: 'token', method, params },
      caller ? { caller } : undefined
    )
  }

  async function result<T>(response: Promise<RpcResponse>): Promise<T> {
    const settled = await response
    if (!settled.ok) {
      throw new Error(`${settled.error.code}: ${settled.error.message}`)
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: each caller names the result type of the method it called.
    return settled.result as T
  }

  const status = (): Promise<QualityGateStatusResult> =>
    result<QualityGateStatusResult>(call('qualityGates.status', { worktree: WORKTREE }))

  const stepCompleted = (): Promise<void> =>
    loop.handle({
      type: 'step-completed',
      worktreeId: 'repo::/work',
      agent: { paneKey: 'tab:leaf', agentType: 'claude', completedAt: 1 }
    })

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'orca-gate-loop-rpc-')))
    worktree = join(root, 'worktree')
    mkdirSync(worktree)
    repoRow = {
      id: 'repo',
      path: worktree,
      kind: 'folder',
      qualityGates: [failing],
      qualityGateFeedbackLoop: { enabled: true, maxRounds: 2 }
    }
    delivered = []
    updateRepo.mockReset()
    updateRepo.mockImplementation(async (_repo, updates) => ({ ...repoRow, ...updates }))
    let nextRun = 0
    _setQualityGateServiceForTests(
      createQualityGateService({
        store: createQualityGateRunStore({ filePath: join(root, 'data', 'runs.json') }),
        hostInstanceId: 'host-a',
        runCommand: runQualityGateCommand,
        readSource: readQualityGateSourceState,
        runnerDirectory: join(root, 'data', 'runners'),
        now: Date.now,
        newRunId: () => `run-${++nextRun}`,
        onRunChanged: (worktreeId) => getQualityGateChangeFeed().notify(worktreeId)
      })
    )
    const switches = createQualityGateFeedbackLoopSwitches({
      filePath: join(root, 'data', 'loop.json')
    })
    loop = createQualityGateFeedbackLoop({
      resolveTarget: (worktreeId) => resolveQualityGateTarget(runtime(), `id:${worktreeId}`),
      service: getQualityGateService(),
      isWorkspaceDisabled: (worktreeId) => switches.isDisabled(worktreeId),
      deliver: async (_agent, text) => {
        delivered.push(text)
        return { kind: 'sent' }
      },
      onChanged: (worktreeId) => getQualityGateChangeFeed().notify(worktreeId),
      newChainId: () => 'qg-rpc'
    })
    _setQualityGateFeedbackLoopForTests({ loop, switches })
  })

  afterEach(() => {
    _setQualityGateFeedbackLoopForTests(null)
    _setQualityGateServiceForTests(null)
    _setQualityGateChangeFeedForTests(null)
    rmSync(root, { recursive: true, force: true })
  })

  it('advertises the capability a client checks before using the loop switch', () => {
    expect(RUNTIME_CAPABILITIES).toContain(QUALITY_GATES_FEEDBACK_LOOP_RUNTIME_CAPABILITY)
  })

  it('reports the loop of the repository settings in the gate status', async () => {
    expect((await status()).feedbackLoop).toEqual({
      enabled: true,
      repoEnabled: true,
      workspaceDisabled: false,
      maxRounds: 2,
      state: 'idle',
      round: 0,
      failingGateIds: []
    })
    repoRow = { id: 'repo', path: worktree, kind: 'folder', qualityGates: [failing] }
    expect((await status()).feedbackLoop).toMatchObject({
      enabled: false,
      repoEnabled: false,
      maxRounds: 3
    })
  })

  it('runs the gates of the settings after a step and shows the chain in the status', async () => {
    await stepCompleted()
    expect(delivered).toHaveLength(1)
    expect(delivered[0]).toContain('1 test failed')
    const after = await status()
    expect(after.gates[0].latestRun).toMatchObject({
      status: 'failed',
      exitCode: 4,
      startedBy: { kind: 'feedback-loop' }
    })
    expect(after.feedbackLoop).toMatchObject({
      state: 'awaiting-agent',
      round: 1,
      failingGateIds: ['test']
    })
  })

  it('signals a loop change through the feed qualityGates.subscribe reports as changed', async () => {
    const target = await resolveQualityGateTarget(runtime(), WORKTREE)
    const changed = vi.fn()
    const unsubscribe = getQualityGateChangeFeed().subscribe(target, changed)
    // Turning the switch moves no run and no file: only the loop changed.
    await result(call('qualityGates.setFeedbackLoop', { worktree: WORKTREE, enabled: false }))
    expect(changed).toHaveBeenCalledTimes(1)
    // The listener takes no argument: the stream has no frame that could carry loop state.
    expect(changed).toHaveBeenCalledWith()
    unsubscribe()
  })

  it('lets any caller turn the loop off for the workspace, which ends a chain in progress', async () => {
    await stepCompleted()
    const off = await result<QualityGateSetFeedbackLoopResult>(
      call('qualityGates.setFeedbackLoop', { worktree: WORKTREE, enabled: false })
    )
    expect(off.feedbackLoop).toMatchObject({
      enabled: false,
      repoEnabled: true,
      workspaceDisabled: true,
      state: 'stopped',
      stopReason: 'disabled'
    })
    await stepCompleted()
    expect(delivered).toHaveLength(1)
    expect((await status()).feedbackLoop).toMatchObject({ enabled: false, workspaceDisabled: true })
  })

  it('turns the workspace back on only for the app or a paired device, never the runtime socket', async () => {
    await result(call('qualityGates.setFeedbackLoop', { worktree: WORKTREE, enabled: false }))
    const fromSocket = await call('qualityGates.setFeedbackLoop', {
      worktree: WORKTREE,
      enabled: true
    })
    expect(fromSocket.ok).toBe(false)
    expect(fromSocket.ok ? '' : fromSocket.error.message).toContain('Orca app')
    expect((await status()).feedbackLoop?.workspaceDisabled).toBe(true)

    const fromApp = await result<QualityGateSetFeedbackLoopResult>(
      call(
        'qualityGates.setFeedbackLoop',
        { worktree: WORKTREE, enabled: true },
        { kind: 'desktop' }
      )
    )
    expect(fromApp.feedbackLoop).toMatchObject({ enabled: true, workspaceDisabled: false })
  })

  it('cannot turn the loop on for a repository that has it off', async () => {
    repoRow = { id: 'repo', path: worktree, kind: 'folder', qualityGates: [failing] }
    const on = await result<QualityGateSetFeedbackLoopResult>(
      call(
        'qualityGates.setFeedbackLoop',
        { worktree: WORKTREE, enabled: true, maxRounds: 9, repoEnabled: true },
        { kind: 'desktop' }
      )
    )
    expect(on.feedbackLoop).toMatchObject({ enabled: false, repoEnabled: false, maxRounds: 3 })
    await stepCompleted()
    expect(delivered).toEqual([])
    expect((await status()).gates[0].latestRun).toBeNull()
  })

  it.each([
    ['the runtime socket', undefined],
    ['the desktop app', { kind: 'desktop' } as const],
    ['a paired device', { kind: 'paired-device', deviceId: 'phone-1' } as const]
  ])('drops the loop setting from repo.update sent by %s', async (_name, caller) => {
    const response = await call(
      'repo.update',
      {
        repo: 'id:repo',
        updates: {
          displayName: 'Renamed',
          qualityGateFeedbackLoop: { enabled: true, maxRounds: 10 }
        }
      },
      caller
    )
    expect(response.ok).toBe(true)
    expect(updateRepo.mock.calls[0][1]).toEqual({ displayName: 'Renamed' })
  })

  it('answers a client of a host from before the loop with method_not_found', async () => {
    const olderHost = ALL_RPC_METHODS.filter(
      (method) => method.name !== 'qualityGates.setFeedbackLoop'
    )
    const response = await call(
      'qualityGates.setFeedbackLoop',
      { worktree: WORKTREE, enabled: false },
      undefined,
      olderHost
    )
    expect(response).toMatchObject({ ok: false, error: { code: 'method_not_found' } })
  })
})
