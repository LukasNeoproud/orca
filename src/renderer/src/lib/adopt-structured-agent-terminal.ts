import type {
  StructuredAgentSessionTerminalAdoptionParams,
  StructuredAgentSessionTerminalAdoptionResult
} from '../../../shared/structured-agent-session-terminal-adoption'
import type {
  AgentSessionHandoffResult,
  AgentSessionMutationResult
} from '../../../shared/agent-session-wire'
import { createStructuredAgentSessionId } from '../../../shared/structured-agent-session-create'
import {
  createStructuredAgentSessionOperationId,
  structuredAgentSessionPayloadFingerprint
} from '../../../shared/structured-agent-session-mutation'
import { callStructuredAgentSession } from '@/runtime/structured-agent-session-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { publishStructuredHandoff } from '@/runtime/structured-agent-session-handoff-store'

export type StructuredTerminalAdoptionInput = Omit<
  StructuredAgentSessionTerminalAdoptionParams,
  'envelope' | 'worktree'
> & { worktreeId: string }

type AdoptionIntent = {
  params: StructuredAgentSessionTerminalAdoptionParams
  pending: Promise<StructuredAgentSessionTerminalAdoptionResult> | null
}

const intents = new Map<string, AdoptionIntent>()
const LOCAL_TARGET = { kind: 'local' } as const

/** Retrying an unanswered adoption must address the same host operation. */
export function adoptStructuredAgentTerminal(
  input: StructuredTerminalAdoptionInput
): Promise<StructuredAgentSessionTerminalAdoptionResult> {
  const { worktreeId, ...source } = input
  const fields = { ...source, worktree: toRuntimeWorktreeSelector(worktreeId) }
  const key = JSON.stringify(fields)
  let intent = intents.get(key)
  if (!intent) {
    const sessionId = createStructuredAgentSessionId(input.agent, () => crypto.randomUUID())
    intent = {
      params: {
        ...fields,
        envelope: {
          sessionId,
          clientOperationId: createStructuredAgentSessionOperationId(() => crypto.randomUUID()),
          expectedRuntimeFence: null,
          payloadFingerprint: structuredAgentSessionPayloadFingerprint({
            method: 'agentSession.adoptTerminal',
            sessionId,
            fields
          })
        }
      },
      pending: null
    }
    intents.set(key, intent)
  }
  const retained = intent
  retained.pending ??= callStructuredAgentSession<StructuredAgentSessionTerminalAdoptionResult>(
    LOCAL_TARGET,
    'agentSession.adoptTerminal',
    retained.params
  )
    .then((result) => {
      // A later conversation in the same terminal must get a fresh adoption intent.
      intents.delete(key)
      return result
    })
    .finally(() => {
      retained.pending = null
    })
  return retained.pending
}

export async function returnAdoptedTerminalToStructuredChat(
  adopted: StructuredAgentSessionTerminalAdoptionResult
): Promise<void> {
  const fields = { direction: 'to-native', mode: 'after-turn', action: 'start' } as const
  const result = await callStructuredAgentSession<
    AgentSessionMutationResult<AgentSessionHandoffResult>
  >(LOCAL_TARGET, 'agentSession.requestHandoff', {
    envelope: {
      sessionId: adopted.sessionId,
      clientOperationId: createStructuredAgentSessionOperationId(() => crypto.randomUUID()),
      expectedRuntimeFence: adopted.fence,
      payloadFingerprint: structuredAgentSessionPayloadFingerprint({
        method: 'agentSession.requestHandoff',
        sessionId: adopted.sessionId,
        fields
      })
    },
    ...fields
  })
  if (!result.ok) {
    throw new Error(result.refusal.message)
  }
  publishStructuredHandoff({
    sessionId: adopted.sessionId,
    fence: result.fence,
    status: result.value.status
  })
}
