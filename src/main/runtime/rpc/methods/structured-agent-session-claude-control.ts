// `agentSession.claudeControl` — out-of-turn requests to a structured Claude chat's running CLI:
// MCP servers, permission rules, a side question. Additive and negotiated: a client calls it only
// once the host advertises `agent-session.claude-control.v1`.

import { ClaudeSessionControlParams } from '../../../../shared/rpc-contract/claude-session-control-params'
import { runClaudeSessionControl } from '../../../claude/claude-session-controls'
import { defineMethod } from '../core'
import { requireClaudeSession } from './structured-agent-session-claude-mods'

export const STRUCTURED_AGENT_SESSION_CLAUDE_CONTROL_METHODS = [
  defineMethod({
    name: 'agentSession.claudeControl',
    permission: 'workspace',
    params: ClaudeSessionControlParams,
    handler: async (params, ctx) => {
      requireClaudeSession(ctx, params.sessionId)
      return { reply: await runClaudeSessionControl(params.sessionId, params.request) }
    }
  })
]
