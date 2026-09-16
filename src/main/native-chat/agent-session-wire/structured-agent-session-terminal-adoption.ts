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
import type {
  TerminalAdoptionExistingOwner,
  TerminalAdoptionPreviousOwner
} from '../../runtime/agent-session-terminal-owner-readoption'
import { readCodexRolloutSessionMetaId } from '../../codex/codex-rollout-session-meta'

export type StructuredTerminalOwnerRegistration = {
  callerKey: string
  params: AgentSessionAttachParams
  owner: StructuredTuiOwner
  terminal: AgentSessionAdoptedTerminal
  revalidate: () => Promise<void>
  existing?: TerminalAdoptionExistingOwner
  previous?: TerminalAdoptionPreviousOwner
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
  handoffs: Pick<
    StructuredAgentSessionHandoffCoordinator,
    'retainProvenTuiOwner' | 'releaseTransferredTuiOwner'
  >,
  statusFeed: Pick<StructuredAgentSessionStatusFeed, 'publish'>,
  input: StructuredTerminalOwnerRegistration
): Promise<StructuredAgentSessionTerminalAdoptionResult> {
  const ids = [
    ...new Set([
      input.params.envelope.sessionId,
      ...(input.previous ? [input.previous.sessionId] : [])
    ])
  ].sort()
  const register = () =>
    registerTerminalOwner(
      {
        deps: context.deps,
        existingSession: context.sessions.get(input.params.envelope.sessionId),
        registered: (sessionId, session, owner) => {
          context.sessions.set(sessionId, session)
          if (input.previous) {
            handoffs.releaseTransferredTuiOwner(input.previous.sessionId)
          }
          handoffs.retainProvenTuiOwner(sessionId, owner)
          statusFeed.publish(sessionId, undefined, { replay: true })
        }
      },
      input
    )
  const serialized = (index: number): Promise<StructuredAgentSessionTerminalAdoptionResult> =>
    index === ids.length ? register() : context.serialize(ids[index]!, () => serialized(index + 1))
  return serialized(0)
}

async function registerTerminalOwner(
  context: {
    deps: StructuredAgentSessionHostDeps
    existingSession?: StructuredAgentSessionHostSession
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
  const prepared =
    params.provider === 'codex' &&
    params.adopt?.providerHandle.kind === 'codex' &&
    params.adopt.transcriptPath
      ? (await readCodexRolloutSessionMetaId(params.adopt.transcriptPath)) ===
        params.adopt.providerHandle.threadId
        ? { ok: true as const, items: null }
        : {
            ok: false as const,
            refusal: { message: 'The Codex conversation identity changed while switching to chat.' }
          }
      : await prepareAdoptedTranscript(params)
  if (!prepared.ok || !params.adopt) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_identity_required',
      prepared.ok ? 'The terminal conversation could not be identified.' : prepared.refusal.message
    )
  }
  if (context.existingSession?.hasProviderChild) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_conflict',
      'The structured provider process must exit before this terminal can attach.'
    )
  }
  const journal =
    context.existingSession?.journal ??
    (await openAgentSessionJournal({
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
    }))
  let committed = false
  try {
    // Codex restores native item identities through thread/resume; importing legacy ids duplicates them.
    if (params.provider !== 'codex' && prepared.items && journal.cursor().sequence <= 1) {
      await journal.replaceEpochItems('legacy_import', 1, prepared.items)
    }
    await input.revalidate()
    const record = await deps.store.adoptTerminalOwner({
      request: {
        ...reserveRequestFor({
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
        adoptedHandleLink: owner.link
      },
      process: owner.process,
      terminal: input.terminal,
      existing: input.existing,
      previous: input.previous
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
      { ...owner, link: record.providerHandleChain.at(-1)! }
    )
    return { sessionId: record.sessionId, fence: record.lease.runtimeFence, agent: record.provider }
  } catch (error) {
    if (!committed) {
      if (!context.existingSession) {
        await agentSessionJournalCloseRetries.closeOrRetain(journal)
      }
      throw error
    }
    throw new StructuredTerminalAdoptionError(
      'agent_session_adoption_unconfirmed',
      'The terminal ownership was recorded, but chat attachment could not be confirmed. Retry switching this same terminal to chat.',
      sessionId
    )
  }
}
