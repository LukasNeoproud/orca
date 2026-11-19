import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  QUALITY_GATES_RUNTIME_CAPABILITY,
  QUALITY_GATES_SUBSCRIBE_RUNTIME_CAPABILITY
} from '../../../../shared/host-feature-runtime-capabilities'
import { RUNTIME_CAPABILITIES } from '../../../../shared/protocol-version'
import type { QualityGateRun, QualityGateStatusResult } from '../../../../shared/quality-gate-types'
import { createQualityGateChangeFeed } from '../../../quality-gates/quality-gate-change-feed'
import { runQualityGateCommand } from '../../../quality-gates/quality-gate-command-run'
import {
  _setQualityGateChangeFeedForTests,
  _setQualityGateServiceForTests,
  getQualityGateChangeFeed
} from '../../../quality-gates/quality-gate-host'
import { createQualityGateRunStore } from '../../../quality-gates/quality-gate-run-store'
import { createQualityGateService } from '../../../quality-gates/quality-gate-service'
import { readQualityGateSourceState } from '../../../quality-gates/quality-gate-source-state'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RpcResponse } from '../core'
import { RpcDispatcher } from '../dispatcher'
import { createSubscriptionRegistryDouble } from '../subscription-registry-test-double'
import { ALL_RPC_METHODS } from './index'

const WORKTREE = { worktree: 'id:repo::/work' }
const lint = { id: 'lint', name: 'Lint', command: 'echo ok', required: true, timeoutSeconds: 30 }

type Frame = { type?: string; subscriptionId?: string }

describe.skipIf(process.platform === 'win32')('qualityGates.subscribe', () => {
  let root: string
  let registry: ReturnType<typeof createSubscriptionRegistryDouble>

  function dispatcher(methods = ALL_RPC_METHODS): RpcDispatcher {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the gate methods read only the members given here.
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      showManagedTerminalWorkspace: async () => ({
        id: 'repo::/work',
        repoId: 'repo',
        path: join(root, 'worktree'),
        hostId: 'local'
      }),
      listRepos: () => [
        { id: 'repo', path: join(root, 'worktree'), kind: 'folder', qualityGates: [lint] }
      ],
      resolveProjectRuntimeForWorktree: () => undefined,
      ...registry
    } as unknown as OrcaRuntimeService
    return new RpcDispatcher({ runtime, methods })
  }

  async function call<T>(method: string, params: unknown, host = dispatcher()): Promise<T> {
    const response = await host.dispatch(
      { id: 'req', authToken: 'token', method, params },
      { caller: { kind: 'desktop' }, connectionId: 'conn-a' }
    )
    if (!response.ok) {
      throw new Error(`${response.error.code}: ${response.error.message}`)
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: each caller names the result type of the method it called.
    return response.result as T
  }

  /** Opens the stream as the transport does: replies arrive while the dispatch stays pending. */
  function subscribe(options: { connectionId?: string; signal?: AbortSignal } = {}) {
    const responses: RpcResponse[] = []
    const settled = dispatcher().dispatchStreaming(
      { id: 'sub', authToken: 'token', method: 'qualityGates.subscribe', params: WORKTREE },
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the dispatcher serializes an RpcResponse.
      (reply) => responses.push(JSON.parse(reply) as RpcResponse),
      { caller: { kind: 'desktop' }, connectionId: options.connectionId ?? 'conn-a', ...options }
    )
    const frames = (): Frame[] =>
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: frames of this stream are plain objects with a type.
      responses.map((response) => (response.ok ? (response.result as Frame) : {}))
    return { settled, frames, types: () => frames().map((frame) => frame.type) }
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'orca-gate-stream-')))
    mkdirSync(join(root, 'worktree'))
    registry = createSubscriptionRegistryDouble()
    _setQualityGateChangeFeedForTests(
      createQualityGateChangeFeed({ readSource: readQualityGateSourceState })
    )
    let next = 0
    _setQualityGateServiceForTests(
      createQualityGateService({
        store: createQualityGateRunStore({ filePath: join(root, 'data', 'runs.json') }),
        hostInstanceId: 'host-a',
        runCommand: runQualityGateCommand,
        readSource: readQualityGateSourceState,
        runnerDirectory: join(root, 'data', 'runners'),
        now: Date.now,
        newRunId: () => `run-${++next}`,
        onRunChanged: (worktreeId) => getQualityGateChangeFeed().notify(worktreeId)
      })
    )
  })

  afterEach(() => {
    _setQualityGateServiceForTests(null)
    _setQualityGateChangeFeedForTests(null)
    rmSync(root, { recursive: true, force: true })
  })

  it('advertises the stream apart from the gates, so a client asks before it subscribes', () => {
    expect(RUNTIME_CAPABILITIES).toContain(QUALITY_GATES_RUNTIME_CAPABILITY)
    expect(RUNTIME_CAPABILITIES).toContain(QUALITY_GATES_SUBSCRIBE_RUNTIME_CAPABILITY)
  })

  it('signals each change of a run and ends when the subscriber says so', async () => {
    const stream = subscribe()
    await expect.poll(() => stream.types()).toEqual(['ready'])
    const subscriptionId = stream.frames()[0].subscriptionId

    await call('qualityGates.run', WORKTREE)
    // Queued, running, finished: the frames carry nothing, the reader asks for the status.
    await expect
      .poll(() => stream.types(), { timeout: 20_000 })
      .toEqual(['ready', 'changed', 'changed', 'changed'])
    expect(stream.frames().slice(1)).toEqual(Array.from({ length: 3 }, () => ({ type: 'changed' })))
    const status = await call<QualityGateStatusResult>('qualityGates.status', WORKTREE)
    expect(status.gates[0].latestRun).toMatchObject({ status: 'passed' })

    expect(await call('qualityGates.unsubscribe', { subscriptionId })).toEqual({
      unsubscribed: true
    })
    await stream.settled
    expect(stream.types().at(-1)).toBe('end')
    expect(getQualityGateChangeFeed().watchedCount()).toBe(0)

    const before = stream.types().length
    await call('qualityGates.run', WORKTREE)
    await expect
      .poll(async () => {
        const next = await call<QualityGateStatusResult>('qualityGates.status', WORKTREE)
        return next.gates[0].latestRun?.liveness
      })
      .toBe('exited')
    expect(stream.types()).toHaveLength(before)
  })

  it('ends with the transport: an aborted stream and a closed connection both stop the watch', async () => {
    const abort = new AbortController()
    const aborted = subscribe({ signal: abort.signal })
    const dropped = subscribe({ connectionId: 'conn-b' })
    await expect.poll(() => [aborted.types(), dropped.types()]).toEqual([['ready'], ['ready']])

    abort.abort()
    await aborted.settled
    expect(aborted.types()).toEqual(['ready', 'end'])
    expect(getQualityGateChangeFeed().watchedCount()).toBe(1)

    registry.cleanupSubscriptionsForConnection('conn-b')
    await dropped.settled
    expect(getQualityGateChangeFeed().watchedCount()).toBe(0)
  })

  it("leaves another connection's stream alone", async () => {
    const stream = subscribe({ connectionId: 'conn-b' })
    await expect.poll(() => stream.types()).toEqual(['ready'])

    // The call below arrives on conn-a.
    await call('qualityGates.unsubscribe', { subscriptionId: stream.frames()[0].subscriptionId })
    expect(getQualityGateChangeFeed().watchedCount()).toBe(1)

    registry.cleanupSubscriptionsForConnection('conn-b')
    await stream.settled
  })

  it('refuses a workspace it cannot resolve instead of opening a silent stream', async () => {
    const responses: RpcResponse[] = []
    await dispatcher().dispatchStreaming(
      { id: 'sub', authToken: 'token', method: 'qualityGates.subscribe', params: {} },
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the dispatcher serializes an RpcResponse.
      (reply) => responses.push(JSON.parse(reply) as RpcResponse),
      { caller: { kind: 'desktop' }, connectionId: 'conn-a' }
    )
    expect(responses).toMatchObject([{ ok: false }])
    expect(getQualityGateChangeFeed().watchedCount()).toBe(0)
  })

  describe('mixed versions', () => {
    const olderHostMethods = ALL_RPC_METHODS.filter(
      (method) =>
        method.name !== 'qualityGates.subscribe' && method.name !== 'qualityGates.unsubscribe'
    )

    it('older host: the stream is method_not_found while status and run answer as before', async () => {
      const olderHost = dispatcher(olderHostMethods)
      const responses: RpcResponse[] = []
      await olderHost.dispatchStreaming(
        { id: 'sub', authToken: 'token', method: 'qualityGates.subscribe', params: WORKTREE },
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the dispatcher serializes an RpcResponse.
        (reply) => responses.push(JSON.parse(reply) as RpcResponse),
        { caller: { kind: 'desktop' }, connectionId: 'conn-a' }
      )
      expect(responses).toMatchObject([{ ok: false, error: { code: 'method_not_found' } }])

      await call('qualityGates.run', WORKTREE, olderHost)
      const status = await call<QualityGateStatusResult>('qualityGates.status', WORKTREE, olderHost)
      expect(status.gates.map((entry) => entry.gate.id)).toEqual(['lint'])
    })

    it('older client: it never subscribes, and every field it reads of a run is still there', async () => {
      // What a client built before `stopReason` and the stream reads from a run.
      const fieldsOfAnOlderClient: (keyof QualityGateRun | 'liveness' | 'freshness')[] = [
        'id',
        'gateId',
        'gate',
        'repoId',
        'worktreeId',
        'worktreePath',
        'startedBy',
        'source',
        'status',
        'requestedAt',
        'startedAt',
        'finishedAt',
        'exitCode',
        'error',
        'outputTruncated',
        'liveness',
        'freshness'
      ]
      const statusesOfAnOlderClient = [
        'queued',
        'running',
        'passed',
        'failed',
        'timed-out',
        'not-started',
        'cancelled',
        'unverifiable'
      ]

      await call('qualityGates.run', WORKTREE)
      await call('qualityGates.cancel', WORKTREE)
      await expect
        .poll(async () => {
          const next = await call<QualityGateStatusResult>('qualityGates.status', WORKTREE)
          return next.gates[0].latestRun?.liveness
        })
        .toBe('exited')
      const run = (await call<QualityGateStatusResult>('qualityGates.status', WORKTREE)).gates[0]
        .latestRun

      for (const field of fieldsOfAnOlderClient) {
        expect(run, field).toHaveProperty(field)
      }
      expect(statusesOfAnOlderClient).toContain(run?.status)
      // Nothing was opened on its behalf.
      expect(getQualityGateChangeFeed().watchedCount()).toBe(0)
    })
  })
})
