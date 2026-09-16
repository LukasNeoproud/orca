import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentSessionRecord } from '../../shared/agent-session-record'
import { AgentSessionRecordStore } from './agent-session-record-store'
import { AGENT_SESSION_STORE_FILE_NAME } from './agent-session-record-store-file'
import { setStoredAgentSessionHandoffStage } from './agent-session-handoff-record-transitions'
import { evictAgentSessionOwner } from './agent-session-lease-transitions'
import type { AgentSessionTerminalOwnerAdoption } from './agent-session-terminal-owner-adoption'

const NOW = 1_800_000_000_000
const LEAF = 'a1111111-1111-4111-8111-111111111111'
let directory: string
let counter: number
let store: AgentSessionRecordStore

function adoption(sessionId = 'codex_alpha'): AgentSessionTerminalOwnerAdoption {
  const id = ++counter
  return {
    request: {
      sessionId,
      location: {
        executionHostId: 'local',
        wslDistro: null,
        workspaceId: 'workspace',
        workspaceKind: 'folder'
      },
      provider: 'codex',
      accountHome: { variable: 'CODEX_HOME', path: join(directory, 'codex-home') },
      adoptedHandleLink: {
        linkId: `link-${id}`,
        handle: { provider: 'codex', threadId: `thread-${sessionId}` },
        origin: 'adopted',
        mintedAtFence: 1,
        observedAt: NOW + id
      },
      runtimeKind: 'tui',
      expectedFence: null,
      spawnToken: 'original-token',
      claimKeyId: 'claim-key',
      handoffOperationId: null,
      probe: { outcome: 'identity-matched', matchedOn: ['process-start-time'] },
      operation: {
        callerKey: 'renderer',
        operationId: `${NOW}-${String(id).padStart(32, '0')}`,
        fingerprint: `${sessionId}-${id}`
      },
      now: NOW + id
    },
    process: {
      hostId: 'local',
      pid: 1234,
      processStartTimeMs: NOW - 60_000,
      spawnToken: 'original-token'
    },
    terminal: {
      tabId: 'terminal',
      paneKey: `terminal:${LEAF}`,
      ptyId: 'pty-original',
      incarnationId: 'incarnation-original'
    }
  }
}

function readoption(
  record: AgentSessionRecord,
  mode: NonNullable<AgentSessionTerminalOwnerAdoption['existing']>['mode']
): AgentSessionTerminalOwnerAdoption {
  const input = adoption(record.sessionId)
  input.existing = { sessionId: record.sessionId, fence: record.lease.runtimeFence, mode }
  input.request.expectedFence = record.lease.runtimeFence
  input.request.adoptedHandleLink!.origin = 'resumed'
  input.request.adoptedHandleLink!.mintedAtFence =
    record.lease.runtimeFence + (mode === 'released' ? 1 : 0)
  return input
}

function release(record: AgentSessionRecord): Promise<AgentSessionRecord> {
  return store.transitionHandoff(record.sessionId, (current) =>
    evictAgentSessionOwner({
      record: current,
      expectedFence: record.lease.runtimeFence,
      probe: { outcome: 'pid-absent' },
      now: NOW,
      journalSettlement: 'not-required'
    })
  )
}

async function reserveWithoutOwner(): Promise<AgentSessionRecord> {
  const released = await release(await store.adoptTerminalOwner(adoption()))
  const input = readoption(released, 'released')
  const reserved = await store.reserveOwner({
    ...input.request,
    spawnToken: 'reserved-token',
    probe: { outcome: 'reservation-unused' }
  })
  return setStoredAgentSessionHandoffStage(store, {
    sessionId: reserved.record.sessionId,
    fence: reserved.record.lease.runtimeFence,
    stage: 'manual-recovery',
    handoffOperationId: null,
    now: NOW
  })
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-terminal-readoption-'))
  counter = 0
  store = await AgentSessionRecordStore.open({ directory, hostId: 'local' })
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('atomic terminal owner readoption', () => {
  it('rejoins a released conversation with its original history and a new fence', async () => {
    const original = await store.adoptTerminalOwner(adoption())
    const released = await release(original)
    const input = readoption(released, 'released')
    input.process = { ...input.process, pid: 5678, spawnToken: 'replacement-token' }
    const rejoined = await store.adoptTerminalOwner(input)

    expect(rejoined.lease).toMatchObject({
      runtimeFence: released.lease.runtimeFence + 1,
      claimStatus: 'live',
      ownerProcess: input.process,
      deathEvidence: null
    })
    expect(rejoined.providerHandleChain).toEqual([
      ...original.providerHandleChain,
      input.request.adoptedHandleLink
    ])
    const restored = await AgentSessionRecordStore.open({ directory, hostId: 'local' })
    expect(restored.getRecord(original.sessionId)?.providerHandleChain).toEqual(
      rejoined.providerHandleChain
    )
    expect(rejoined.adoptedTerminal?.ownerFence).toBe(rejoined.lease.runtimeFence)
  })

  it('reattaches the exact live writer without advancing its fence or duplicating a replay', async () => {
    const original = await store.adoptTerminalOwner(adoption())
    const input = readoption(original, 'live')
    const rejoined = await store.adoptTerminalOwner(input)
    expect(rejoined.lease.runtimeFence).toBe(original.lease.runtimeFence)
    expect(rejoined.lease.ownerProcess).toEqual(original.lease.ownerProcess)
    expect(await store.adoptTerminalOwner(input)).toEqual(rejoined)
    expect(store.listRecords()).toEqual([rejoined])
    expect(store.listOperationRows()).toHaveLength(2)
  })

  it('completes only the exact token of an ownerless terminal reservation', async () => {
    const reserved = await reserveWithoutOwner()
    const input = readoption(reserved, 'reserved')
    input.process.spawnToken = 'reserved-token'
    const rejoined = await store.adoptTerminalOwner(input)
    expect(rejoined.lease).toMatchObject({
      runtimeFence: reserved.lease.runtimeFence,
      claimStatus: 'live',
      handoffStage: null,
      ownerProcess: input.process
    })
    expect(rejoined.providerHandleChain.slice(0, -1)).toEqual(reserved.providerHandleChain)
  })

  it.each(['wrong-token', 'unknown-process'] as const)(
    'preserves an ownerless reservation after refusing %s',
    async (kind) => {
      const reserved = await reserveWithoutOwner()
      const input = readoption(reserved, 'reserved')
      input.process.spawnToken = kind === 'wrong-token' ? 'other-token' : 'reserved-token'
      if (kind === 'unknown-process') {
        input.process.processStartTimeMs = null
      }
      const persisted = await readFile(join(directory, AGENT_SESSION_STORE_FILE_NAME), 'utf8')
      await expect(store.adoptTerminalOwner(input)).rejects.toThrow()
      expect(store.getRecord(reserved.sessionId)).toEqual(reserved)
      expect(await readFile(join(directory, AGENT_SESSION_STORE_FILE_NAME), 'utf8')).toBe(persisted)
    }
  )

  it('atomically moves the same process from A to B without fabricating its death', async () => {
    const original = await store.adoptTerminalOwner(adoption())
    await store.setSessionTabVisibility(original.sessionId, true)
    const input = adoption('codex_beta')
    input.previous = { sessionId: original.sessionId, fence: original.lease.runtimeFence }
    const moved = await store.adoptTerminalOwner(input)
    const previous = store.getRecord(original.sessionId)!
    expect(previous.lease).toMatchObject({
      runtimeFence: original.lease.runtimeFence + 1,
      claimStatus: 'released',
      ownerProcess: null,
      reservedSpawnToken: null,
      provenHandleLinkId: null,
      deathEvidence: null
    })
    expect(previous.providerHandleChain).toEqual(original.providerHandleChain)
    expect(moved.lease.ownerProcess).toEqual(original.lease.ownerProcess)
    expect(store.listVisibleSessionIds()).toEqual([moved.sessionId])
    const restored = await AgentSessionRecordStore.open({ directory, hostId: 'local' })
    expect(restored.getRecord(original.sessionId)?.lease.claimStatus).toBe('released')
    expect(restored.getRecord(moved.sessionId)?.lease.claimStatus).toBe('live')
  })

  it.each(['invalid-target', 'stale-previous', 'foreign-previous'] as const)(
    'rolls back both records and the operation when transferring with %s',
    async (kind) => {
      const original = await store.adoptTerminalOwner(adoption())
      await store.setSessionTabVisibility(original.sessionId, true)
      const input = adoption('codex_beta')
      input.previous = { sessionId: original.sessionId, fence: original.lease.runtimeFence }
      if (kind === 'invalid-target') {
        input.request.adoptedHandleLink!.mintedAtFence = 9
      }
      if (kind === 'stale-previous') {
        input.previous.fence += 1
      }
      if (kind === 'foreign-previous') {
        input.process.pid += 1
      }
      const persisted = await readFile(join(directory, AGENT_SESSION_STORE_FILE_NAME), 'utf8')
      await expect(store.adoptTerminalOwner(input)).rejects.toThrow()
      expect(store.listRecords()).toEqual([original])
      expect(store.listOperationRows()).toHaveLength(1)
      expect(store.listVisibleSessionIds()).toEqual([original.sessionId])
      expect(await readFile(join(directory, AGENT_SESSION_STORE_FILE_NAME), 'utf8')).toBe(persisted)
    }
  )

  it.each(['stale-fence', 'foreign-process', 'pending-handoff', 'different-account'] as const)(
    'preserves the live target when readoption has %s',
    async (kind) => {
      let original = await store.adoptTerminalOwner(adoption())
      if (kind === 'pending-handoff') {
        original = await setStoredAgentSessionHandoffStage(store, {
          sessionId: original.sessionId,
          fence: original.lease.runtimeFence,
          stage: 'preparing',
          handoffOperationId: null,
          now: NOW
        })
      }
      const input = readoption(original, 'live')
      if (kind === 'stale-fence') {
        input.existing!.fence += 1
      }
      if (kind === 'foreign-process') {
        input.process.pid += 1
      }
      if (kind === 'different-account') {
        input.request.accountHome.path = join(directory, 'other')
      }
      await expect(store.adoptTerminalOwner(input)).rejects.toThrow()
      expect(store.listRecords()).toEqual([original])
      expect(store.listOperationRows()).toHaveLength(1)
    }
  )
})
