import type { AgentSessionHandleProvider } from '../../../shared/agent-session-provider-handle'
import type { StructuredAgentSessionResumeSource } from '../../../shared/structured-agent-session-create'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'

// Concurrent launches must not join another host, agent, workspace, or adopted session.
export function structuredAgentLaunchIdentity(
  worktreeId: string,
  agent: AgentSessionHandleProvider,
  resumeFrom?: StructuredAgentSessionResumeSource,
  target: RuntimeClientTarget = { kind: 'local' }
): string {
  const targetIdentity = target.kind === 'local' ? 'local' : `environment:${target.environmentId}`
  return resumeFrom
    ? `${targetIdentity}:${agent}:${worktreeId}:resume:${resumeFrom.providerSessionId}`
    : `${targetIdentity}:${agent}:${worktreeId}`
}
