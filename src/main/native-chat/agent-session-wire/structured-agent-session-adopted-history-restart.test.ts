import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionRecord } from '../../../shared/agent-session-record'
import type { AgentSessionRecordStore } from '../../runtime/agent-session-record-store'
import type { AgentSessionJournal } from '../agent-session-journal/journal-store'
import type {
  StructuredAgentSessionHandoffDeps,
  StructuredAgentSessionHandoffFlowContext,
  StructuredTuiOwner
} from './structured-agent-session-handoff-types'
import type { StructuredAgentSessionRestartAccess } from './structured-agent-session-handoff-restart-tui'
import { restoreStructuredAgentSessionHandoff } from './structured-agent-session-handoff-restart'
import { handoffStructuredSessionToNative } from './structured-agent-session-handoff-reverse'

const transitions = vi.hoisted(() => ({ reserve: vi.fn(), stop: vi.fn() }))
vi.mock('../../runtime/agent-session-handoff-record-transitions', () => ({
  reserveStoredAgentSessionHandoffOwner: transitions.reserve,
  stopStoredAgentSessionOwnerForHandoff: transitions.stop
}))

const SESSION = 'adopted-codex'
const OPERATION = 'return-to-native'
const NOW = 1_800_000_000_000
let current: AgentSessionRecord

function originalRecord(): AgentSessionRecord {
  return {
    sessionId: SESSION,
    provider: 'codex',
    location: {
      executionHostId: 'local',
      wslDistro: null,
      workspaceId: 'workspace',
      workspaceKind: 'folder'
    },
    adoptedTerminal: {
      tabId: 'original-tab',
      paneKey: 'original-tab:11111111-1111-4111-8111-111111111111',
      ptyId: 'original-shell',
      incarnationId: 'original-incarnation'
    },
    providerHandleChain: [
      {
        linkId: 'original',
        handle: { provider: 'codex', threadId: 'thread-1' },
        origin: 'adopted',
        mintedAtFence: 1,
        observedAt: NOW
      }
    ],
    lease: {
      runtimeKind: 'tui',
      runtimeFence: 5,
      claimStatus: 'released',
      ownerProcess: null,
      handoffStage: 'old-owner-stopped',
      handoffOperationId: OPERATION
    }
  } as unknown as AgentSessionRecord
}

function setup() {
  let owner: StructuredTuiOwner | undefined
  const imported = vi.fn(async () => undefined)
  const recoveredCatchup = vi.fn(async () => undefined)
  const activeCatchup = vi.fn(async () => undefined)
  const restoredOwner: StructuredTuiOwner = {
    terminal: {
      tabId: 'later-tab',
      paneKey: 'later-tab:22222222-2222-4222-8222-222222222222',
      handle: 'later-handle',
      ptyId: 'later-pty'
    },
    process: { hostId: 'local', pid: 42, processStartTimeMs: NOW, spawnToken: 'later-token' },
    link: {
      linkId: 'later-link',
      handle: { provider: 'codex', threadId: 'thread-1' },
      origin: 'resumed',
      mintedAtFence: 5,
      observedAt: NOW
    },
    transcriptPath: '/account/session.jsonl'
  }
  const acquireNative = vi.fn(async () => {
    current = {
      ...current,
      lease: {
        ...current.lease,
        runtimeKind: 'native',
        claimStatus: 'live',
        handoffStage: null,
        handoffOperationId: null
      }
    }
    return current
  })
  const deps: StructuredAgentSessionHandoffDeps = {
    store: {
      getRecord: () => current,
      recordOperationOutcome: vi.fn(async () => undefined)
    } as unknown as AgentSessionRecordStore,
    claimKeyId: 'key',
    now: () => NOW,
    session: () => ({ journal: {} as AgentSessionJournal, fence: current.lease.runtimeFence }),
    suspendNative: vi.fn(),
    acquireNative,
    importTuiHistory: imported,
    retryPendingSettlement: vi.fn(),
    recoverTuiHistoryCatchup: recoveredCatchup,
    activateTuiHistoryCatchup: activeCatchup,
    publish: vi.fn(),
    schedule: async (_id, task) => task(),
    transport: {
      hostLabel: 'Local',
      launchTui: vi.fn(),
      recoverTuiOwner: async () => restoredOwner,
      reproveTuiOwner: async ({ owner }) => owner,
      stopRecoveredOwner: vi.fn(),
      waitForTuiExit: async () => ({}),
      waitForTuiIdleOrExit: async () => 'idle',
      tuiStatus: () => 'idle'
    }
  }
  const flow: StructuredAgentSessionHandoffFlowContext = {
    deps,
    owner: () => owner,
    retainOwner: (_id, retained) => {
      owner = retained
    },
    releaseOwner: () => {
      owner = undefined
    },
    setStatus: vi.fn(),
    publishStage: vi.fn(),
    requireRecord: () => current,
    enterPreparing: async () => {
      current = {
        ...current,
        lease: { ...current.lease, handoffStage: 'preparing', handoffOperationId: OPERATION }
      }
    }
  }
  const restart: StructuredAgentSessionRestartAccess = {
    deps,
    requireRecord: flow.requireRecord,
    flowContext: () => flow,
    retainOwner: flow.retainOwner,
    setStatus: flow.setStatus
  }
  return { restart, flow, imported, recoveredCatchup, activeCatchup, acquireNative, restoredOwner }
}

beforeEach(() => {
  vi.clearAllMocks()
  current = originalRecord()
  transitions.stop.mockImplementation(async () => {
    current = {
      ...current,
      lease: {
        ...current.lease,
        claimStatus: 'released',
        ownerProcess: null,
        handoffStage: 'old-owner-stopped'
      }
    }
    return current
  })
  transitions.reserve.mockImplementation(async () => {
    current = {
      ...current,
      lease: {
        ...current.lease,
        runtimeKind: 'native',
        claimStatus: 'reserved',
        runtimeFence: current.lease.runtimeFence + 1,
        handoffStage: 'new-owner-proving'
      }
    }
    return current
  })
})

describe('adopted Codex history after restart', () => {
  it('resumes without a second legacy import when restart follows the original child exit', async () => {
    const test = setup()
    expect(test.flow.owner(SESSION)).toBeUndefined()
    await restoreStructuredAgentSessionHandoff(test.restart, SESSION)
    expect(test.acquireNative).toHaveBeenCalledOnce()
    expect(test.imported).not.toHaveBeenCalled()
    expect(current.lease).toMatchObject({ runtimeKind: 'native', handoffStage: null })
  })

  it('keeps native history identities through recovery of a later TUI owner', async () => {
    const test = setup()
    current = {
      ...current,
      lease: {
        ...current.lease,
        claimStatus: 'live',
        ownerProcess: test.restoredOwner.process,
        handoffStage: null,
        handoffOperationId: null
      }
    }
    expect(test.restoredOwner.historySource).toBeUndefined()
    await restoreStructuredAgentSessionHandoff(test.restart, SESSION)
    expect(test.recoveredCatchup).not.toHaveBeenCalled()
    expect(test.activeCatchup).not.toHaveBeenCalled()
    await handoffStructuredSessionToNative(
      test.flow,
      {
        envelope: {
          sessionId: SESSION,
          clientOperationId: OPERATION,
          expectedRuntimeFence: 5,
          payloadFingerprint: 'return'
        },
        direction: 'to-native',
        mode: 'now'
      },
      false
    )
    expect(test.imported).not.toHaveBeenCalled()
    expect(test.acquireNative).toHaveBeenCalledOnce()
  })

  it.each(['legacy-codex', 'adopted-claude'])(
    'preserves the legacy import policy for %s',
    async (provider) => {
      if (provider === 'legacy-codex') {
        delete current.adoptedTerminal
      } else {
        current.provider = 'claude'
      }
      const test = setup()
      await restoreStructuredAgentSessionHandoff(test.restart, SESSION)
      expect(test.imported).toHaveBeenCalledOnce()
      expect(test.acquireNative).toHaveBeenCalledOnce()
    }
  )
})
