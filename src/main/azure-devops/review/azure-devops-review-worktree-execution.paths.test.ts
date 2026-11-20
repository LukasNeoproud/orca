import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  QualityGateDefinition,
  QualityGateRunStartResult,
  QualityGateStatusResult
} from '../../../shared/quality-gate-types'
import type { QualityGateCommandResult } from '../../quality-gates/quality-gate-command-run'
import { createQualityGateFeedbackLoop } from '../../quality-gates/quality-gate-feedback-loop'
import { _setQualityGateServiceForTests } from '../../quality-gates/quality-gate-host'
import { createQualityGateRunStore } from '../../quality-gates/quality-gate-run-store'
import {
  createQualityGateService,
  type QualityGateService
} from '../../quality-gates/quality-gate-service'
import { resolveQualityGateTarget } from '../../quality-gates/quality-gate-target'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import type { RpcResponse } from '../../runtime/rpc/core'
import { RpcDispatcher } from '../../runtime/rpc/dispatcher'
import { QUALITY_GATE_METHODS } from '../../runtime/rpc/methods/quality-gates'
import type { RpcCallerIdentity } from '../../runtime/rpc/rpc-caller-identity'
import { _setAzureDevOpsReviewWorktreeRegistryPath } from './azure-devops-review-worktree'
import { refuseAzureDevOpsReviewWorktreeExecution } from './azure-devops-review-worktree-execution'
import { saveAzureDevOpsReviewWorktreeEntry } from './azure-devops-review-worktree-registry'

const REVIEW = 'repo::/work/app-review'
const ORDINARY = 'repo::/work/feature'
const tests: QualityGateDefinition = {
  id: 'test',
  name: 'Tests',
  command: 'run-tests',
  required: true,
  timeoutSeconds: 60
}
const PASSED: QualityGateCommandResult = {
  status: 'passed',
  exitCode: 0,
  stdout: 'ok\n',
  stderr: '',
  outputTruncated: false,
  error: null
}

/**
 * Every way a gate starts, against the host's real gate service, review registry and RPC methods.
 * Only the command itself is made up, so a refusal is shown by the command never running. That the
 * CLI and the agent tool send these requests and pass the refusal on is pinned in their own tests
 * (`index-quality-gates.test.ts`, `azure-devops-review-gate-tool-calls.test.ts`).
 */
describe('gates in a review worktree follow the remembered review depth', () => {
  let dir: string
  let commandsRun: string[]
  let service: QualityGateService
  let dispatcher: RpcDispatcher

  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: resolving a gate target reads only the members given here.
  const runtime = {
    getRuntimeId: () => 'test-runtime',
    showManagedTerminalWorkspace: async (selector: string) => {
      const id = selector.replace(/^id:/, '')
      return { id, repoId: 'repo', path: id.split('::')[1], hostId: 'local' }
    },
    listRepos: () => [
      {
        id: 'repo',
        path: '/work/app',
        kind: 'folder',
        qualityGates: [tests],
        qualityGateFeedbackLoop: { enabled: true, maxRounds: 3 }
      }
    ],
    resolveProjectRuntimeForWorktree: () => undefined
  } as unknown as OrcaRuntimeService

  function rpc(method: string, params: unknown, caller?: RpcCallerIdentity): Promise<RpcResponse> {
    return dispatcher.dispatch(
      { id: 'req', authToken: 'token', method, params },
      caller ? { caller } : undefined
    )
  }

  async function rpcError(response: Promise<RpcResponse>): Promise<string> {
    const settled = await response
    return settled.ok ? '' : settled.error.message
  }

  const startFrom: Record<string, (worktreeId: string) => Promise<string>> = {
    'the app window': (worktreeId) =>
      rpcError(rpc('qualityGates.run', { worktree: `id:${worktreeId}` }, { kind: 'desktop' })),
    'a paired device': (worktreeId) =>
      rpcError(
        rpc(
          'qualityGates.run',
          { worktree: `id:${worktreeId}` },
          { kind: 'paired-device', deviceId: 'phone-1' }
        )
      ),
    // No caller on the transport is the runtime socket, which `orca` and its MCP servers use.
    'the runtime socket, as orca gates run sends it': (worktreeId) =>
      rpcError(rpc('qualityGates.run', { worktree: `id:${worktreeId}` })),
    'the runtime socket, as the ado_run_gate tool sends it': (worktreeId) =>
      rpcError(rpc('qualityGates.run', { worktree: `id:${worktreeId}`, gateIds: ['test'] }))
  }

  function loopFor(worktreeId: string) {
    const sent: string[] = []
    const loop = createQualityGateFeedbackLoop({
      resolveTarget: (id) => resolveQualityGateTarget(runtime, `id:${id}`),
      service,
      isWorkspaceDisabled: () => false,
      deliver: async (_agent, text) => {
        sent.push(text)
        return { kind: 'sent' }
      },
      onChanged: () => undefined,
      newChainId: () => 'qg-1'
    })
    const step = (): Promise<void> =>
      loop.handle({
        type: 'step-completed',
        worktreeId,
        agent: { paneKey: 'tab:claude', agentType: 'claude', terminalHandle: 't1', completedAt: 1 }
      })
    const status = async () =>
      loop.status(await resolveQualityGateTarget(runtime, `id:${worktreeId}`))
    return { step, status, sent }
  }

  async function latestRuns(worktreeId: string): Promise<unknown[]> {
    const response = await rpc('qualityGates.status', { worktree: `id:${worktreeId}` })
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the status method answers with this type.
    const status = response.result as QualityGateStatusResult
    return status.gates.map((entry) => entry.latestRun)
  }

  function rememberReview(reviewDepth?: 'static' | 'build' | 'build-and-test'): void {
    saveAzureDevOpsReviewWorktreeEntry({
      repoKey: 'dev.azure.com/contoso/web/app',
      worktreeId: REVIEW,
      repoId: 'repo',
      path: '/work/app-review',
      pullRequestKey: 'dev.azure.com/contoso+repo+7',
      commit: 'sha7',
      ...(reviewDepth ? { reviewDepth } : {})
    })
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orca-review-depth-paths-'))
    _setAzureDevOpsReviewWorktreeRegistryPath(join(dir, 'review-worktrees.json'))
    commandsRun = []
    let nextRun = 0
    service = createQualityGateService({
      store: createQualityGateRunStore({ filePath: join(dir, 'runs.json') }),
      hostInstanceId: 'host-a',
      runCommand: async ({ command }) => {
        commandsRun.push(command)
        return PASSED
      },
      readSource: async () => ({ head: 'aaa', clean: true, fingerprint: 'f0' }),
      runnerDirectory: join(dir, 'runners'),
      now: Date.now,
      newRunId: () => `run-${++nextRun}`,
      // The same wiring as quality-gate-host.ts.
      refuseRun: refuseAzureDevOpsReviewWorktreeExecution
    })
    _setQualityGateServiceForTests(service)
    dispatcher = new RpcDispatcher({ runtime, methods: QUALITY_GATE_METHODS })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(async () => {
    await service.whenIdle(REVIEW)
    await service.whenIdle(ORDINARY)
    vi.restoreAllMocks()
    _setQualityGateServiceForTests(null)
    _setAzureDevOpsReviewWorktreeRegistryPath(null)
    rmSync(dir, { recursive: true, force: true })
  })

  describe.each(Object.keys(startFrom))('started from %s', (path) => {
    it('is refused with the way to change the depth when the review is static', async () => {
      rememberReview('static')
      const message = await startFrom[path](REVIEW)
      expect(message).toContain('the review of this pull request is static')
      expect(message).toContain('choose Build or Build and run tests')
      expect(commandsRun).toEqual([])
      expect(await latestRuns(REVIEW)).toEqual([null])
    })

    it('is refused in a review worktree from a build that remembered no depth', async () => {
      rememberReview()
      expect(await startFrom[path](REVIEW)).toContain('no review depth was chosen')
      expect(commandsRun).toEqual([])
    })

    it.each(['build', 'build-and-test'] as const)('runs at depth %s', async (depth) => {
      rememberReview(depth)
      expect(await startFrom[path](REVIEW)).toBe('')
      await service.whenIdle(REVIEW)
      expect(commandsRun).toEqual(['run-tests'])
    })

    it('runs in a worktree that is no review worktree, whatever reviews exist', async () => {
      rememberReview('static')
      expect(await startFrom[path](ORDINARY)).toBe('')
      await service.whenIdle(ORDINARY)
      expect(commandsRun).toEqual(['run-tests'])
    })
  })

  describe('started by the feedback loop after an agent step', () => {
    it('stops with the refusal as its reason and sends the agent nothing', async () => {
      rememberReview('static')
      const { step, status, sent } = loopFor(REVIEW)
      await step()
      expect(await status()).toMatchObject({
        state: 'stopped',
        stopReason: 'run-refused',
        round: 0
      })
      expect(commandsRun).toEqual([])
      expect(sent).toEqual([])
      expect(await latestRuns(REVIEW)).toEqual([null])
    })

    it('is refused in a review worktree from a build that remembered no depth', async () => {
      rememberReview()
      const { step, status } = loopFor(REVIEW)
      await step()
      expect(await status()).toMatchObject({ state: 'stopped', stopReason: 'run-refused' })
      expect(commandsRun).toEqual([])
    })

    it('runs the required gates at depth build', async () => {
      rememberReview('build')
      const { step, status } = loopFor(REVIEW)
      await step()
      expect(await status()).toMatchObject({ state: 'passed' })
      expect(commandsRun).toEqual(['run-tests'])
    })

    it('runs in a worktree that is no review worktree', async () => {
      rememberReview('static')
      const { step, status } = loopFor(ORDINARY)
      await step()
      expect(await status()).toMatchObject({ state: 'passed' })
      expect(commandsRun).toEqual(['run-tests'])
    })
  })

  it('takes no depth from the request: the caller may be the agent being checked', async () => {
    rememberReview('static')
    const response = await rpc('qualityGates.run', {
      worktree: `id:${REVIEW}`,
      depth: 'build-and-test',
      reviewDepth: 'build-and-test'
    })
    expect(await rpcError(Promise.resolve(response))).toContain(
      'review of this pull request is static'
    )
    expect(commandsRun).toEqual([])
  })

  it('lets the same request through once the user chose a depth that runs code', async () => {
    rememberReview('static')
    expect(await startFrom['the app window'](REVIEW)).toContain('static')
    rememberReview('build')
    const response = await rpc('qualityGates.run', { worktree: `id:${REVIEW}` })
    expect(response.ok).toBe(true)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the run method answers with this type.
    const started = (response.ok ? response.result : null) as QualityGateRunStartResult
    expect(started.runs.map(({ run }) => run.gateId)).toEqual(['test'])
  })

  it('still lists the gates and reads the status of a static review', async () => {
    rememberReview('static')
    expect((await rpc('qualityGates.list', { worktree: `id:${REVIEW}` })).ok).toBe(true)
    expect((await rpc('qualityGates.status', { worktree: `id:${REVIEW}` })).ok).toBe(true)
  })
})
