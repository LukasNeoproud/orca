import { AGENT_SESSION_BRANCH_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import type { RpcContext } from '../core'
import { requireStructuredCapability } from './structured-agent-session-gate'

export function requireBranchCapability(ctx: RpcContext): void {
  requireStructuredCapability(ctx)
  if (
    ctx.clientKind !== undefined &&
    !ctx.clientCapabilities?.includes(AGENT_SESSION_BRANCH_RUNTIME_CAPABILITY)
  ) {
    throw new Error('structured_agent_session_unsupported')
  }
}
