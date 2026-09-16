import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  agentSessionLeaseFixture,
  agentSessionRecordFixture
} from '../../../shared/agent-session-record.test-fixture'
import { AgentSessionRecordStore } from '../../runtime/agent-session-record-store'
import { createTrackedJournalOpener } from '../agent-session-journal/journal-store-test-open'
import { StructuredAgentSessionHandoffCoordinator } from './structured-agent-session-handoff'
import { StructuredHandoffTestRequests } from './structured-agent-session-handoff-test-requests'
import type { StructuredAgentSessionHandoffDeps } from './structured-agent-session-handoff-types'

const NOW = 1_800_000_000_000
const record = agentSessionRecordFixture(agentSessionLeaseFixture({ runtimeKind: 'native' }))
const journals = createTrackedJournalOpener()
let root: string
let store: AgentSessionRecordStore
let coordinator: StructuredAgentSessionHandoffCoordinator
let requests: StructuredHandoffTestRequests
let schedule: ReturnType<typeof vi.fn<StructuredAgentSessionHandoffDeps['schedule']>>
let journal: Awaited<ReturnType<typeof journals.open>>

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-handoff-readmission-'))
  store = await AgentSessionRecordStore.open({ directory: join(root, 'store'), hostId: 'local' })
  vi.spyOn(store, 'getRecord').mockReturnValue(record)
  journal = await journals.open({
    identity: {
      sessionId: record.sessionId,
      workspaceId: record.location.workspaceId,
      hostId: 'local',
      agent: 'claude',
      providerHandle: { kind: 'claude', sessionId: 'provider-session-alpha-1', leafUuid: null }
    },
    journalDir: join(root, 'journal')
  })
  // Admission is exercised against the real ledger; leave accepted transitions scheduled.
  schedule = vi.fn(async () => {})
  coordinator = new StructuredAgentSessionHandoffCoordinator({
    store,
    transport: {},
    session: () => ({ journal, fence: record.lease.runtimeFence }),
    publish: vi.fn(),
    schedule,
    now: () => NOW
  } as unknown as StructuredAgentSessionHandoffDeps)
  requests = new StructuredHandoffTestRequests(
    NOW,
    record.sessionId,
    () => record.lease.runtimeFence
  )
})

afterEach(async () => {
  await coordinator.drain()
  await journals.closeAll()
  await rm(root, { recursive: true, force: true })
})

describe('handoff admission after a settled request', () => {
  it.each(['start', 'retry', 'recover'] as const)(
    'admits a fresh handoff after refusing an ineligible %s',
    async (action) => {
      const refused = await coordinator.request(
        'client',
        requests.request('to-native', 'now', { action })
      )
      expect(refused.ok).toBe(false)
      expect(schedule).not.toHaveBeenCalled()

      const next = await coordinator.request('client', requests.request('to-tui', 'now'))
      expect(next.ok).toBe(true)
      expect(schedule).toHaveBeenCalledOnce()
    }
  )

  it.each([false, true])(
    'admits another switch after cancellation (ledger failure: %s)',
    async (ledgerFailure) => {
      await journal.appendItem(
        { provider: 'orca', clientMessageId: 'running-turn' },
        { kind: 'status', text: 'Working', turnLifecycle: { turnId: 'turn-1', state: 'running' } },
        { fence: record.lease.runtimeFence }
      )
      const queued = requests.request('to-tui', 'after-turn')
      expect((await coordinator.request('client', queued)).ok).toBe(true)
      if (ledgerFailure) {
        vi.spyOn(store, 'recordOperationOutcome').mockRejectedValueOnce(new Error('write failed'))
      }
      const cancelled = coordinator.request(
        'client',
        requests.request('to-tui', 'after-turn', {
          action: 'cancel-queued'
        })
      )
      if (ledgerFailure) {
        await expect(cancelled).rejects.toThrow('write failed')
      } else {
        expect((await cancelled).ok).toBe(true)
      }

      const next = await coordinator.request('client', requests.request('to-tui', 'after-turn'))
      expect(next.ok).toBe(true)
      expect(schedule).not.toHaveBeenCalled()
      await coordinator.request(
        'client',
        requests.request('to-tui', 'after-turn', {
          action: 'cancel-queued'
        })
      )
    }
  )
})
