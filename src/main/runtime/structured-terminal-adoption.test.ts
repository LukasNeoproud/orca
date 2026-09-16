import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type { AgentProviderSessionMetadata } from '../../shared/agent-session-resume'
import type { StructuredAgentSessionTerminalAdoptionParams } from '../../shared/structured-agent-session-terminal-adoption'
import { isOriginalAdoptedTerminalOwner } from '../../shared/structured-agent-session-terminal-adoption'
import {
  reserveStoredAgentSessionHandoffOwner,
  setStoredAgentSessionHandoffStage,
  stopStoredAgentSessionOwnerForHandoff
} from './agent-session-handoff-record-transitions'
import type { RuntimePtyWorktreeRecord } from './runtime-terminal-state-records'
import { StructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-host'
import type { StructuredAgentSessionAdapter } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import type {
  StructuredTuiOwner,
  StructuredAgentSessionHandoffTransport
} from '../native-chat/agent-session-wire/structured-agent-session-handoff-types'
import { StructuredHandoffTestRequests } from '../native-chat/agent-session-wire/structured-agent-session-handoff-test-requests'
import { AgentSessionRecordStore } from './agent-session-record-store'
import {
  adoptStructuredTerminal,
  type StructuredTerminalAdoptionContext
} from './structured-terminal-adoption'
import { recoverStructuredTerminalAdoption } from './structured-terminal-adoption-recovery'
import { readStructuredTuiProcessIdentity } from './structured-tui-process-identity'
import { probeAgentSessionProcessIdentity } from './agent-session-process-identity-probe'
import { resolveProcessCwd } from '../providers/process-cwd'
import { readStructuredTerminalCodexRollouts } from './structured-terminal-codex-rollout-proof'
import { agentSessionPtyWriteGate } from './agent-session-pty-write-gate'
import { OrcaRuntimeWithProveRecoveredStructuredTuiPtyProcess } from './orca-runtime-prove-recovered-structured-tui-pty-process'

vi.mock('./structured-tui-process-identity', () => ({ readStructuredTuiProcessIdentity: vi.fn() }))
vi.mock('./agent-session-process-identity-probe', () => ({
  PROCESS_START_TIME_TOLERANCE_MS: 2000,
  probeAgentSessionProcessIdentity: vi.fn()
}))
vi.mock('./agent-session-spawn-token-readback', () => ({
  readEchoedAgentSessionSpawnToken: vi.fn(async () => null)
}))
vi.mock('./orca-runtime-get-worktree-ps', () => ({ OrcaRuntimeWithGetWorktreePs: class {} }))
vi.mock('./structured-terminal-codex-rollout-proof', () => ({
  readStructuredTerminalCodexRollouts: vi.fn()
}))
vi.mock('../providers/process-cwd', () => ({ resolveProcessCwd: vi.fn() }))

const NOW = 1_800_000_000_000
const THREAD = '019fd532-7c11-7a90-b6de-4e1a2c3d5f60'
const PANE = 'terminal:a1111111-1111-4111-8111-111111111111'
let root: string
let host: StructuredAgentSessionHost
let store: AgentSessionRecordStore
let context: StructuredTerminalAdoptionContext
let pty: RuntimePtyWorktreeRecord
let rows: AgentStatusIpcPayload[]
let rollouts: AgentProviderSessionMetadata[]
let childExited: boolean
let childPid: number
let childStart: number
let processCommand: string
let serial = 0
const acquire = vi.fn<StructuredAgentSessionAdapter['acquire']>()
const closeTerminal = vi.fn()
const signalObserved = () => Promise.withResolvers<void>()
let stopped: ReturnType<typeof signalObserved>
let revealed: ReturnType<typeof signalObserved>

function request(sessionId = 'session-adopted'): StructuredAgentSessionTerminalAdoptionParams {
  return {
    envelope: {
      sessionId,
      expectedRuntimeFence: null,
      clientOperationId: `${NOW}-${(++serial).toString(16).padStart(32, '0')}`,
      payloadFingerprint: sessionId
    },
    agent: 'codex',
    providerSessionId: THREAD,
    worktree: 'workspace',
    terminal: { ptyId: 'pty-original', tabId: 'terminal', paneKey: PANE }
  }
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'orca-live-terminal-adoption-')))
  vi.mocked(resolveProcessCwd).mockResolvedValue(root)
  const home = join(root, 'codex-home')
  const sessions = join(home, 'sessions', '2026', '09', '10')
  await mkdir(sessions, { recursive: true })
  const transcript = join(sessions, `rollout-2026-09-10T10-00-00-${THREAD}.jsonl`)
  await writeFile(
    transcript,
    `${[
      {
        type: 'session_meta',
        payload: { id: THREAD, cwd: '/workspace', timestamp: '2026-09-10T10:00:00Z' }
      },
      {
        type: 'response_item',
        timestamp: '2026-09-10T10:00:01Z',
        payload: { type: 'message', role: 'user', content: 'Existing prompt' }
      }
    ]
      .map((row) => JSON.stringify(row))
      .join('\n')}\n`
  )
  serial = 0
  childExited = false
  childPid = 202
  childStart = NOW - 60000
  processCommand = 'codex --sandbox read-only --model gpt-5.6 Existing prompt'
  stopped = signalObserved()
  revealed = signalObserved()
  closeTerminal.mockReset()
  vi.mocked(readStructuredTuiProcessIdentity).mockImplementation(async (input) => {
    input.onProcessCommand?.(processCommand)
    return {
      hostId: 'local',
      pid: childPid,
      processStartTimeMs: childStart,
      spawnToken: input.spawnToken
    }
  })
  vi.mocked(probeAgentSessionProcessIdentity).mockImplementation(async () =>
    childExited
      ? { outcome: 'pid-absent' }
      : { outcome: 'identity-matched', matchedOn: ['process-start-time'] }
  )
  vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
    expect(pid).toBe(202)
    expect(signal).toBe('SIGTERM')
    stopped.resolve()
    return true
  })
  pty = {
    ptyId: 'pty-original',
    incarnationId: 'incarnation',
    connected: true,
    connectionId: null,
    worktreeId: 'workspace',
    tabId: 'terminal',
    paneKey: PANE,
    isWsl: false,
    wslDistro: null,
    launchToken: null
  } as RuntimePtyWorktreeRecord
  rows = [
    {
      paneKey: PANE,
      connectionId: null,
      receivedAt: NOW,
      stateStartedAt: NOW,
      state: 'done',
      prompt: 'Existing prompt',
      agentType: 'codex',
      providerSession: { key: 'session_id', id: THREAD, transcriptPath: transcript }
    }
  ]
  rollouts = [rows[0]!.providerSession!]
  vi.mocked(readStructuredTerminalCodexRollouts).mockImplementation(async () => rollouts)
  store = await AgentSessionRecordStore.open({ directory: join(root, 'store'), hostId: 'local' })
  acquire.mockReset().mockImplementation(async ({ identity, fence, spawnToken, events }) => {
    expect(childExited).toBe(true)
    expect(identity.providerHandle).toEqual({ kind: 'codex', threadId: THREAD })
    events?.appendItem(
      { provider: 'codex', threadId: THREAD, turnId: 'original-turn', ordinal: 0 },
      { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'Existing prompt' }] }
    )
    return {
      process: { hostId: 'local', pid: 303, processStartTimeMs: NOW, spawnToken },
      link: {
        linkId: `native-${fence}`,
        handle: { provider: 'codex', threadId: THREAD },
        origin: 'resumed',
        mintedAtFence: fence,
        observedAt: NOW
      }
    }
  })
  const adapter: StructuredAgentSessionAdapter = {
    acquire,
    dispatch: vi.fn(),
    cancelTurn: vi.fn(),
    answerPrompt: vi.fn(),
    setOption: vi.fn(),
    disposeSession: vi.fn(async () => true)
  }
  const originalRuntime = { ptysById: new Map([[pty.ptyId, pty]]), closeTerminal }
  const closeOwner = (
    OrcaRuntimeWithProveRecoveredStructuredTuiPtyProcess.prototype as unknown as {
      closeStructuredTuiOwner: (owner: StructuredTuiOwner) => Promise<{ transcriptPath?: string }>
    }
  ).closeStructuredTuiOwner
  const transport: StructuredAgentSessionHandoffTransport = {
    hostLabel: 'This computer',
    launchTui: vi.fn(),
    reproveTuiOwner: async ({ record }) =>
      recoverStructuredTerminalAdoption({
        record,
        workspacePath: root,
        readPty: () => pty,
        listProcesses: (id) => context.listProcesses(id),
        providerRows: () => rows,
        issueHandle: () => 'term-original'
      }),
    recoverTuiOwner: vi.fn(),
    stopRecoveredOwner: vi.fn(),
    waitForTuiExit: vi.fn(),
    waitForTuiIdleOrExit: vi.fn(),
    tuiStatus: () => 'idle',
    closeTuiOwner: (owner) => closeOwner.call(originalRuntime, owner),
    revealNativeSession: () => {
      revealed.resolve()
    }
  }
  host = new StructuredAgentSessionHost({
    store,
    adapter,
    journalRoot: join(root, 'journals'),
    claimKeyId: 'key',
    now: () => NOW,
    probeOwner: async () => ({ outcome: 'identity-matched', matchedOn: ['process-start-time'] }),
    handoffTransport: transport
  })
  context = {
    runtime: {},
    host,
    location: {
      executionHostId: 'local',
      wslDistro: null,
      workspaceId: 'workspace',
      workspaceKind: 'folder'
    },
    workspacePath: root,
    readPty: () => pty,
    issueHandle: () => 'term-original',
    accountHomes: () => [home],
    providerRows: () => rows,
    listProcesses: vi.fn(
      async () =>
        [{ id: pty.ptyId, incarnationId: pty.incarnationId!, rootProcessId: 100 }] as never
    )
  }
  agentSessionPtyWriteGate.attachRecordLookup((id) => store.getRecord(id))
})

afterEach(async () => {
  childExited = true
  await host.flushAllStreamedEvents()
  agentSessionPtyWriteGate.detachRecordLookup()
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})

describe('adopting a live terminal into structured ownership', () => {
  it.each(['mismatched', 'unverifiable'] as const)(
    'refuses a %s working directory before adoption',
    async (state) => {
      const elsewhere = join(root, 'other-workspace')
      await mkdir(elsewhere)
      vi.mocked(resolveProcessCwd).mockResolvedValue(state === 'mismatched' ? elsewhere : '')
      await expect(adoptStructuredTerminal(context, request(), 'renderer')).rejects.toThrow(
        /working directory|outside this workspace/
      )
      expect(store.listRecords()).toEqual([])
      expect(acquire).not.toHaveBeenCalled()
      expect(process.kill).not.toHaveBeenCalled()
    }
  )
  it('keeps the same shell, thread and history and acquires native only after the proved child exits', async () => {
    const result = await adoptStructuredTerminal(context, request(), 'renderer')
    expect(result).toEqual({ sessionId: 'session-adopted', fence: 1, agent: 'codex' })
    expect(acquire).not.toHaveBeenCalled()
    expect(store.getRecord(result.sessionId)).toMatchObject({
      launchArgs: ['--sandbox', 'read-only', '--model', 'gpt-5.6'],
      adoptedTerminal: { ...request().terminal, incarnationId: 'incarnation' },
      lease: { runtimeKind: 'tui', claimStatus: 'live', ownerProcess: { pid: 202 } }
    })
    expect(host.journalSnapshot(result.sessionId).items).toEqual([])
    const requests = new StructuredHandoffTestRequests(
      NOW,
      result.sessionId,
      () => store.getRecord(result.sessionId)!.lease.runtimeFence
    )
    const handoff = requests.request('to-native', 'now', {
      operationId: `${NOW}-${'f'.repeat(32)}`
    })
    expect(await host.requestHandoff({ callerKey: 'renderer' }, handoff)).toMatchObject({
      ok: true
    })
    await stopped.promise
    expect(acquire).not.toHaveBeenCalled()
    expect(store.getRecord(result.sessionId)?.lease.ownerProcess?.pid).toBe(202)
    childExited = true
    await revealed.promise
    await host.flushStreamedEvents(result.sessionId)
    expect(acquire).toHaveBeenCalledOnce()
    expect(closeTerminal).not.toHaveBeenCalled()
    expect(pty.connected).toBe(true)
    expect(store.getRecord(result.sessionId)?.lease).toMatchObject({
      runtimeKind: 'native',
      claimStatus: 'live',
      ownerProcess: { pid: 303 }
    })
    expect(host.journalSnapshot(result.sessionId).items).toHaveLength(1)

    // A later native-to-TUI reservation belongs to its new PTY, not the retained original shell.
    const native = store.getRecord(result.sessionId)!
    const operationId = `${NOW}-${'e'.repeat(32)}`
    await setStoredAgentSessionHandoffStage(store, {
      sessionId: result.sessionId,
      fence: native.lease.runtimeFence,
      stage: 'preparing',
      handoffOperationId: operationId,
      now: NOW
    })
    const closed = await stopStoredAgentSessionOwnerForHandoff(store, {
      sessionId: result.sessionId,
      expectedFence: native.lease.runtimeFence,
      operationId,
      now: NOW
    })
    const replacement = await reserveStoredAgentSessionHandoffOwner(store, {
      sessionId: result.sessionId,
      expectedFence: closed.lease.runtimeFence,
      operationId,
      now: NOW,
      runtimeKind: 'tui',
      spawnToken: 'new-terminal-token',
      claimKeyId: 'key'
    })
    expect(replacement.adoptedTerminal).toBeDefined()
    expect(isOriginalAdoptedTerminalOwner(replacement)).toBe(false)
    const readOriginal = vi.fn(() => pty)
    await expect(
      recoverStructuredTerminalAdoption({
        record: replacement,
        workspacePath: root,
        readPty: readOriginal,
        listProcesses: context.listProcesses,
        providerRows: () => rows,
        issueHandle: context.issueHandle
      })
    ).rejects.toThrow('agent_session_identity_required')
    expect(readOriginal).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent and later envelopes for the same proved original writer', async () => {
    const first = request()
    const [one, two] = await Promise.all([
      adoptStructuredTerminal(context, first, 'renderer'),
      adoptStructuredTerminal(context, request('session-reloaded'), 'renderer-reloaded')
    ])
    expect(two).toEqual(one)
    expect(
      await adoptStructuredTerminal(context, request('session-later'), 'renderer-later')
    ).toEqual(one)
    expect(store.listRecords()).toHaveLength(1)
    expect(acquire).not.toHaveBeenCalled()
  })

  it('rechecks the child working directory before a later transfer stops it', async () => {
    const result = await adoptStructuredTerminal(context, request(), 'renderer')
    const elsewhere = join(root, 'different-cwd')
    await mkdir(elsewhere)
    vi.mocked(resolveProcessCwd).mockResolvedValue(elsewhere)
    const requests = new StructuredHandoffTestRequests(NOW, result.sessionId, () => result.fence)
    await host.requestHandoff(
      { callerKey: 'handoff-renderer' },
      requests.request('to-native', 'now')
    )
    await vi.waitFor(async () => {
      expect(await host.handoffStatus(result.sessionId)).toMatchObject({
        owner: 'tui',
        phase: 'failed'
      })
    })
    expect(process.kill).not.toHaveBeenCalled()
    expect(acquire).not.toHaveBeenCalled()
    expect(store.getRecord(result.sessionId)?.lease).toMatchObject({
      runtimeKind: 'tui',
      claimStatus: 'live'
    })
  })

  it.each(['different-pid', 'reused-pid'] as const)(
    'refuses replay after a %s resumes the same thread inside the original shell',
    async (change) => {
      await adoptStructuredTerminal(context, request(), 'renderer')
      if (change === 'different-pid') {
        childPid = 404
      }
      childStart += 10000
      const reveal = vi.spyOn(host, 'revealSession')
      await expect(
        adoptStructuredTerminal(context, request('session-new'), 'renderer-new')
      ).rejects.toThrow('another structured owner')
      expect(reveal).not.toHaveBeenCalled()
      expect(store.listRecords()).toHaveLength(1)
      expect(acquire).not.toHaveBeenCalled()
    }
  )

  it('refuses stale provider evidence and unsupported launch arguments before reserving', async () => {
    vi.mocked(readStructuredTerminalCodexRollouts).mockResolvedValueOnce(null)
    await expect(adoptStructuredTerminal(context, request(), 'renderer')).rejects.toThrow(
      'could not identify'
    )
    rows[0]!.receivedAt = NOW
    processCommand = 'codex --remote ws://another-server'
    await expect(adoptStructuredTerminal(context, request(), 'renderer')).rejects.toThrow(
      'cannot be preserved'
    )
    expect(store.listRecords()).toEqual([])
    expect(agentSessionPtyWriteGate.boundSessionId(pty.ptyId)).toBeNull()
    expect(acquire).not.toHaveBeenCalled()
  })

  it('adopts the active rollout without a hook or provider-session hint', async () => {
    rows = []
    const input = request()
    delete input.providerSessionId
    await expect(adoptStructuredTerminal(context, input, 'renderer')).resolves.toMatchObject({
      sessionId: input.envelope.sessionId,
      fence: 1
    })
    expect(acquire).not.toHaveBeenCalled()
  })

  it('deduplicates a hint that arrives while the same terminal proof is pending', async () => {
    const proof = Promise.withResolvers<AgentProviderSessionMetadata[]>()
    vi.mocked(readStructuredTerminalCodexRollouts).mockReturnValueOnce(proof.promise)
    const first = request()
    delete first.providerSessionId
    const beforeHook = adoptStructuredTerminal(context, first, 'renderer')
    const afterHook = adoptStructuredTerminal(context, request('hook-arrived'), 'renderer')
    proof.resolve(rollouts)
    expect(await afterHook).toEqual(await beforeHook)
    expect(store.listRecords()).toHaveLength(1)
    expect(store.listOperationRows()).toHaveLength(1)
  })

  it.each(['thread', 'transcript'] as const)(
    'refuses a changed %s during proof before recording any owner',
    async (changed) => {
      vi.mocked(readStructuredTerminalCodexRollouts)
        .mockResolvedValueOnce(rollouts)
        .mockResolvedValueOnce([
          {
            ...rollouts[0]!,
            ...(changed === 'thread'
              ? { id: 'another-thread' }
              : { transcriptPath: `${rollouts[0]!.transcriptPath}.another-account` })
          }
        ])
      await expect(adoptStructuredTerminal(context, request(), 'renderer')).rejects.toThrow(
        'switched conversations'
      )
      expect(store.listRecords()).toEqual([])
      expect(process.kill).not.toHaveBeenCalled()
    }
  )

  it('moves the same live process between conversations and rejoins its existing journal', async () => {
    const first = await adoptStructuredTerminal(context, request(), 'renderer')
    const originalEpoch = host.journalSnapshot(first.sessionId).cursor.epoch
    expect(originalEpoch).toEqual(expect.any(String))
    const oldRollout = rollouts[0]!
    const nextThread = '019fd532-7c11-7a90-b6de-4e1a2c3d5f61'
    const nextFile = oldRollout.transcriptPath!.replace(THREAD, nextThread)
    await writeFile(
      nextFile,
      `${JSON.stringify({ type: 'session_meta', payload: { id: nextThread, source: 'cli' } })}\n`
    )
    rollouts = [{ key: 'session_id', id: nextThread, transcriptPath: nextFile }]
    processCommand = `codex resume ${THREAD} --sandbox read-only`
    // Both the hook and the old launch argv still name A after interactive /resume selected B.
    const second = await adoptStructuredTerminal(context, request('session-second'), 'renderer')
    expect(second.sessionId).toBe('session-second')
    expect(store.getRecord(first.sessionId)?.lease).toMatchObject({
      claimStatus: 'released',
      ownerProcess: null,
      deathEvidence: null
    })
    expect(store.getRecord(second.sessionId)?.providerHandleChain.at(-1)?.handle).toEqual({
      provider: 'codex',
      threadId: nextThread
    })
    expect(agentSessionPtyWriteGate.boundSessionId(pty.ptyId)).toBe(second.sessionId)
    await host.close(first.sessionId)
    expect(process.kill).not.toHaveBeenCalled()

    rollouts = [oldRollout]
    const rejoined = await adoptStructuredTerminal(context, request('unused-new-id'), 'renderer')
    expect(rejoined.sessionId).toBe(first.sessionId)
    expect(rejoined.fence).toBeGreaterThan(first.fence)
    expect(host.journalSnapshot(first.sessionId).cursor.epoch).toBe(originalEpoch)
    expect(store.listRecords()).toHaveLength(2)
    expect(
      store.getRecord(first.sessionId)?.providerHandleChain.map((link) => link.origin)
    ).toEqual(['adopted', 'resumed'])
    expect(isOriginalAdoptedTerminalOwner(store.getRecord(first.sessionId)!)).toBe(true)
    expect(store.getRecord(second.sessionId)?.lease.claimStatus).toBe('released')
    expect(acquire).not.toHaveBeenCalled()
    expect(process.kill).not.toHaveBeenCalled()
  })

  it('rejoins the exact persisted live TUI owner after restart reconciliation', async () => {
    const first = await adoptStructuredTerminal(context, request(), 'renderer')
    const restored = await AgentSessionRecordStore.open({
      directory: join(root, 'store'),
      hostId: 'local'
    })
    host = new StructuredAgentSessionHost({ ...host.deps, store: restored })
    store = restored
    context.host = host
    agentSessionPtyWriteGate.unbindPty(pty.ptyId)
    await host.reconcileRestartLeases()
    const rejoined = await adoptStructuredTerminal(
      context,
      request('restarted-intent'),
      'restarted-renderer'
    )
    expect(rejoined).toEqual(first)
    expect(store.listRecords()).toHaveLength(1)
    expect(await host.handoffStatus(first.sessionId)).toMatchObject({ phase: 'idle', owner: 'tui' })
    expect(acquire).not.toHaveBeenCalled()
  })

  it('preserves a failed earlier reservation when a different terminal cannot prove its launch token', async () => {
    const first = await adoptStructuredTerminal(context, request(), 'renderer')
    const operationId = `${NOW}-${'d'.repeat(32)}`
    await setStoredAgentSessionHandoffStage(store, {
      sessionId: first.sessionId,
      fence: first.fence,
      stage: 'preparing',
      handoffOperationId: operationId,
      now: NOW
    })
    const stoppedRecord = await stopStoredAgentSessionOwnerForHandoff(store, {
      sessionId: first.sessionId,
      expectedFence: first.fence,
      operationId,
      now: NOW
    })
    const reserved = await reserveStoredAgentSessionHandoffOwner(store, {
      sessionId: first.sessionId,
      expectedFence: stoppedRecord.lease.runtimeFence,
      operationId,
      now: NOW,
      runtimeKind: 'tui',
      spawnToken: 'failed-launch-token',
      claimKeyId: 'key'
    })
    await setStoredAgentSessionHandoffStage(store, {
      sessionId: first.sessionId,
      fence: reserved.lease.runtimeFence,
      stage: 'manual-recovery',
      handoffOperationId: operationId,
      now: NOW
    })
    const before = store.getRecord(first.sessionId)
    expect(before?.lease).toMatchObject({
      claimStatus: 'reserved',
      ownerProcess: null,
      processlessAt: null
    })
    childPid = 404
    childStart += 10000
    pty = { ...pty, ptyId: 'pty-after-failed-launch', incarnationId: 'replacement-incarnation' }
    const input = request('new-intent')
    input.terminal.ptyId = pty.ptyId
    await expect(adoptStructuredTerminal(context, input, 'renderer')).rejects.toMatchObject({
      code: 'agent_session_ownership_unknown',
      sessionId: first.sessionId
    })
    expect(store.getRecord(first.sessionId)).toEqual(before)
    expect(store.listRecords()).toHaveLength(1)
    expect(acquire).not.toHaveBeenCalled()
    expect(process.kill).not.toHaveBeenCalled()
  })
})
