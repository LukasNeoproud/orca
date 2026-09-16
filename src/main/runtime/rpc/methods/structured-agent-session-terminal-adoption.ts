import { z } from 'zod'
import {
  agentSessionFingerprintConflict,
  computeAgentSessionPayloadFingerprint
} from '../../../../shared/agent-session-mutation-envelope'
import { defineMethod, type RpcAnyMethod } from '../core'
import {
  ensureStructuredHostInstalled,
  requireStructuredCapability,
  structuredCallerFor
} from './structured-agent-session-gate'
import { MutationEnvelope } from './structured-agent-session-schemas'

const Identifier = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value === value.trim())

export const StructuredTerminalAdoptionParams = z
  .object({
    envelope: MutationEnvelope,
    worktree: z.string().min(1).max(32_768),
    agent: z.enum(['codex', 'claude']),
    providerSessionId: Identifier.optional(),
    terminal: z
      .object({ tabId: Identifier, paneKey: Identifier, ptyId: z.string().min(1).max(32_768) })
      .strict()
  })
  .strict()

export const STRUCTURED_TERMINAL_ADOPTION_METHODS: RpcAnyMethod[] = [
  defineMethod({
    name: 'agentSession.adoptTerminal',
    params: StructuredTerminalAdoptionParams,
    handler: async (params, ctx) => {
      requireStructuredCapability(ctx)
      if (params.envelope.expectedRuntimeFence !== null) {
        throw new Error('agent_session_operation_invalid')
      }
      const { envelope, ...fields } = params
      const conflict = agentSessionFingerprintConflict(
        envelope,
        computeAgentSessionPayloadFingerprint({
          method: 'agentSession.adoptTerminal',
          sessionId: envelope.sessionId,
          fields
        })
      )
      if (conflict) {
        throw new Error(conflict.code)
      }
      await ensureStructuredHostInstalled(ctx)
      return ctx.runtime.adoptStructuredAgentSessionTerminal(
        params,
        structuredCallerFor(ctx).callerKey
      )
    }
  })
]
