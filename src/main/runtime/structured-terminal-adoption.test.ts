import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
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
      ).rejects.toThrow('different agent owner')
      expect(reveal).not.toHaveBeenCalled()
      expect(store.listRecords()).toHaveLength(1)
      expect(acquire).not.toHaveBeenCalled()
    }
  )

  it('refuses stale provider evidence and unsupported launch arguments before reserving', async () => {
    rows[0]!.receivedAt = childStart - 1
    await expect(adoptStructuredTerminal(context, request(), 'renderer')).rejects.toThrow(
      'has not proved'
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
})
