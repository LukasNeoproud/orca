import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentSessionRecordStore } from './agent-session-record-store'
import type { AgentSessionTerminalOwnerAdoption } from './agent-session-terminal-owner-adoption'
import { isAgentSessionRecord } from '../../shared/agent-session-record'

const NOW = 1_800_000_000_000
const LEAF = 'a1111111-1111-4111-8111-111111111111'
let directory: string

function adoption(sessionId = 'codex_original'): AgentSessionTerminalOwnerAdoption {
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
      launchArgs: ['--config', 'sandbox_mode="workspace-write"'],
      adoptedHandleLink: {
        linkId: 'link-1',
        handle: { provider: 'codex', threadId: 'existing-thread' },
        origin: 'adopted',
        mintedAtFence: 1,
        observedAt: NOW
      },
      runtimeKind: 'tui',
      expectedFence: null,
      spawnToken: 'proven-process',
      claimKeyId: 'claim-key',
      handoffOperationId: null,
      probe: { outcome: 'identity-matched', matchedOn: ['process-start-time'] },
      operation: {
        callerKey: 'desktop-renderer',
        operationId: `${NOW}-${(sessionId === 'codex_original' ? '1' : '2').padStart(32, '0')}`,
        fingerprint: sessionId
      },
      now: NOW
    },
    process: {
      hostId: 'local',
      pid: 1234,
      processStartTimeMs: NOW - 60_000,
      spawnToken: 'proven-process'
    },
    terminal: {
      tabId: 'terminal',
      paneKey: `terminal:${LEAF}`,
      ptyId: 'pty-original',
      incarnationId: 'incarnation-original'
    }
  }
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-terminal-adoption-store-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('durable terminal owner adoption', () => {
  it('persists the live writer, exact original terminal and replay result together', async () => {
    const store = await AgentSessionRecordStore.open({ directory, hostId: 'local' })
    const input = adoption()
    const record = await store.adoptTerminalOwner(input)
    expect(record.lease).toMatchObject({
      runtimeKind: 'tui',
      runtimeFence: 1,
      claimStatus: 'live',
      ownerProcess: input.process
    })
    expect(record.adoptedTerminal).toEqual(input.terminal)
    expect(record.providerHandleChain.at(-1)?.handle).toEqual({
      provider: 'codex',
      threadId: 'existing-thread'
    })
    expect(isAgentSessionRecord(record)).toBe(true)

    const restored = await AgentSessionRecordStore.open({ directory, hostId: 'local' })
    const persisted = restored.getRecord(record.sessionId)
    expect(persisted).toMatchObject({
      adoptedTerminal: input.terminal,
      launchArgs: input.request.launchArgs,
      location: input.request.location,
      lease: {
        runtimeKind: 'tui',
        claimStatus: 'live',
        ownerProcess: input.process,
        unreconciled: true
      }
    })
    expect(restored.listOperationRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: { status: 'succeeded', sessionId: record.sessionId } })
      ])
    )
  })

  it('replays without a new fence or second record', async () => {
    const store = await AgentSessionRecordStore.open({ directory, hostId: 'local' })
    const input = adoption()
    await store.adoptTerminalOwner(input)
    const replay = await store.adoptTerminalOwner(input)
    expect(replay.lease.runtimeFence).toBe(1)
    expect(store.listRecords()).toHaveLength(1)
    expect(store.listOperationRows()).toHaveLength(1)
  })

  it('refuses a competing claim for the same provider conversation', async () => {
    const store = await AgentSessionRecordStore.open({ directory, hostId: 'local' })
    const first = await store.adoptTerminalOwner(adoption())
    await expect(store.adoptTerminalOwner(adoption('codex_competitor'))).rejects.toThrow()
    expect(store.listRecords()).toEqual([first])
  })

  it.each(['missing-start-time', 'wrong-spawn-token', 'native-runtime'] as const)(
    'does not leave a reservation after rejecting %s',
    async (kind) => {
      const store = await AgentSessionRecordStore.open({ directory, hostId: 'local' })
      const input = adoption()
      if (kind === 'missing-start-time') {
        input.process.processStartTimeMs = null
      }
      if (kind === 'wrong-spawn-token') {
        input.process.spawnToken = 'another-process'
      }
      if (kind === 'native-runtime') {
        input.request.runtimeKind = 'native'
      }
      await expect(store.adoptTerminalOwner(input)).rejects.toThrow()
      expect(store.listRecords()).toEqual([])
      const restored = await AgentSessionRecordStore.open({ directory, hostId: 'local' })
      expect(restored.listRecords()).toEqual([])
      expect(restored.listOperationRows()).toEqual([])
    }
  )

  it('validates optional terminal scope without rejecting older records', async () => {
    const store = await AgentSessionRecordStore.open({ directory, hostId: 'local' })
    const record = await store.adoptTerminalOwner(adoption())
    const { adoptedTerminal: terminal, ...legacy } = record
    expect(isAgentSessionRecord(legacy)).toBe(true)
    expect(
      isAgentSessionRecord({ ...record, adoptedTerminal: { ...terminal, tabId: 'wrong-tab' } })
    ).toBe(false)
  })
})
