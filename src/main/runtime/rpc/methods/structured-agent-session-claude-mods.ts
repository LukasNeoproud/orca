// `agentSession.claudeModsRequest` / `agentSession.claudeModsSubscribe` — Claude Code mods'
// remote surface (panes, the band above the prompt, toasts) for a structured Claude chat.
//
// Additive and negotiated: a client calls these only once the host advertises
// `agent-session.claude-mods.v1`, and treats any failure as "no mods drawn".

import {
  ClaudeModsRequestParams,
  ClaudeModsSubscribeParams
} from '../../../../shared/rpc-contract/claude-mods-surface-params'
import {
  claudeModsSessionChannel,
  existingClaudeModsSessionChannel
} from '../../../claude/claude-mods-surface-channel'
import { defineMethod, defineStreamingMethod, type RpcContext } from '../core'
import {
  requireStructuredAgentAudience,
  requireStructuredHost
} from './structured-agent-session-gate'
import { bindStructuredAgentSessionStream } from './structured-agent-session-status-stream'

/** A chat subscribes before its first message starts the child, so an unknown session is
 *  admitted (its channel waits for the child); only a known non-Claude session is refused. */
function requireClaudeSession(ctx: RpcContext, sessionId: string): void {
  const agent = requireStructuredHost(ctx).sessionAgent(sessionId)
  if (agent) {
    requireStructuredAgentAudience(ctx, agent)
    if (agent !== 'claude') {
      throw new Error('Claude mods are drawn only in Claude chats')
    }
  }
}

function claudeModsSubscriptionId(ctx: RpcContext, sessionId: string): string {
  const base = `agentSession.claude-mods:${ctx.connectionId ?? 'local'}:${sessionId}`
  return ctx.requestId ? `${base}:${ctx.requestId}` : base
}

export const STRUCTURED_AGENT_SESSION_CLAUDE_MODS_METHODS = [
  defineMethod({
    name: 'agentSession.claudeModsRequest',
    permission: 'workspace',
    params: ClaudeModsRequestParams,
    handler: async (params, ctx) => {
      requireClaudeSession(ctx, params.sessionId)
      const channel = existingClaudeModsSessionChannel(params.sessionId)
      if (!channel) {
        throw new Error('Claude mods are unavailable: no-connection')
      }
      return { response: (await channel.request(params.subtype, params.fields)) ?? null }
    }
  }),
  defineStreamingMethod({
    name: 'agentSession.claudeModsSubscribe',
    permission: 'workspace',
    params: ClaudeModsSubscribeParams,
    handler: async (params, ctx, emit) => {
      requireClaudeSession(ctx, params.sessionId)
      let dispose = (): void => {}
      const stream = bindStructuredAgentSessionStream(
        ctx,
        claudeModsSubscriptionId(ctx, params.sessionId),
        () => dispose()
      )
      if (stream.isClosed()) {
        return
      }
      dispose = claudeModsSessionChannel(params.sessionId).subscribe(emit)
      if (stream.isClosed()) {
        dispose()
      }
    }
  })
]
