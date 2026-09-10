import type {
  AgentSessionAdoptedTerminal,
  StructuredAgentSessionTerminalAdoptionResult
} from '../../../shared/structured-agent-session-terminal-adoption'
import { agentSessionJournalCloseRetries } from '../agent-session-journal/journal-close-retry'
import { journalDirectoryFor } from '../agent-session-journal/journal-paths'
import { openAgentSessionJournal } from '../agent-session-journal/journal-store-factory'
import { prepareAdoptedTranscript } from './structured-agent-session-adopted-import'
import { reserveRequestFor, type AgentSessionAttachParams } from './structured-agent-session-attach'
import type { StructuredTuiOwner } from './structured-agent-session-handoff-types'
import type {
  StructuredAgentSessionHostDeps,
  StructuredAgentSessionHostSession
} from './structured-agent-session-host-types'
import type { StructuredAgentSessionAttachContext } from './structured-agent-session-attach-context'
import type { StructuredAgentSessionHandoffCoordinator } from './structured-agent-session-handoff'
import type { StructuredAgentSessionStatusFeed } from './structured-agent-session-status-feed'

export type StructuredTerminalOwnerRegistration = {
  callerKey: string
  params: AgentSessionAttachParams
  owner: StructuredTuiOwner
  terminal: AgentSessionAdoptedTerminal
  revalidate: () => Promise<void>
}

export class StructuredTerminalAdoptionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly sessionId?: string
  ) {
    super(message)
    this.name = 'StructuredTerminalAdoptionError'
  }
}

export function registerStructuredTerminalOwner(
  context: Pick<StructuredAgentSessionAttachContext, 'deps' | 'sessions' | 'serialize'>,
  handoffs: Pick<StructuredAgentSessionHandoffCoordinator, 'retainProvenTuiOwner'>,
  statusFeed: Pick<StructuredAgentSessionStatusFeed, 'publish'>,
  input: StructuredTerminalOwnerRegistration
): Promise<StructuredAgentSessionTerminalAdoptionResult> {
  return context.serialize(input.params.envelope.sessionId, () =>
    registerTerminalOwner(
      {
        deps: context.deps,
        registered: (sessionId, session, owner) => {
          context.sessions.set(sessionId, session)
          handoffs.retainProvenTuiOwner(sessionId, owner)
          statusFeed.publish(sessionId, undefined, { replay: true })
        }
      },
      input
    )
  )
}

async function registerTerminalOwner(
  context: {
    deps: StructuredAgentSessionHostDeps
    registered: (
      sessionId: string,
      session: StructuredAgentSessionHostSession,
      owner: StructuredTuiOwner
    ) => void
  },
  input: StructuredTerminalOwnerRegistration
): Promise<StructuredAgentSessionTerminalAdoptionResult> {
  const { params, owner } = input
  const { deps } = context
  const sessionId = params.envelope.sessionId
  const prepared = await prepareAdoptedTranscript(params)
  if (!prepared.ok || !params.adopt) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_identity_required',
      prepared.ok ? 'The terminal conversation could not be identified.' : prepared.refusal.message
    )
  }
  const journal = await openAgentSessionJournal({
    identity: {
      sessionId,
      workspaceId: params.location.workspaceId,
      hostId: params.location.executionHostId,
      agent: params.agent,
      providerHandle: params.adopt.providerHandle
    },
    journalDir: journalDirectoryFor(deps.journalRoot, {
      workspaceId: params.location.workspaceId,
      sessionId
    })
  })
  let committed = false
  try {
    // Codex restores native item identities through thread/resume; importing legacy ids duplicates them.
    if (params.provider !== 'codex' && prepared.items && journal.cursor().sequence <= 1) {
      await journal.replaceEpochItems('legacy_import', 1, prepared.items)
    }
    await input.revalidate()
    const record = await deps.store.adoptTerminalOwner({
      request: reserveRequestFor({
        sessionId,
        params,
        authority: {
          spawnToken: owner.process.spawnToken,
          claimKeyId: deps.claimKeyId,
          handoffOperationId: null,
          probe: { outcome: 'identity-matched', matchedOn: ['process-start-time'] },
          launchArgs: params.launchArgs
        },
        callerKey: input.callerKey,
        fingerprint: params.envelope.payloadFingerprint,
        now: deps.now?.() ?? Date.now()
      }),
      process: owner.process,
      terminal: input.terminal
    })
    committed = true
    context.registered(
      sessionId,
      {
        journal,
        params,
        fence: record.lease.runtimeFence,
        hasProviderChild: false,
        acquisitionGeneration: null
      },
      owner
    )
    return { sessionId: record.sessionId, fence: record.lease.runtimeFence, agent: record.provider }
  } catch (error) {
    if (!committed) {
      await agentSessionJournalCloseRetries.closeOrRetain(journal)
      throw error
    }
    throw new StructuredTerminalAdoptionError(
      'agent_session_adoption_unconfirmed',
      'The terminal ownership was recorded, but chat attachment could not be confirmed. Retry switching this same terminal to chat.',
      sessionId
    )
  }
}
