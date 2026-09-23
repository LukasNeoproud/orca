import type {
  AgentContextTransitionDependencyInspection,
  AgentContextTransitionRequest,
  AgentContextTransitionTarget
} from '../../shared/agent-context-transition'
import { activeStructuredAgentSessionTurnId } from '../../shared/structured-agent-session-projection'
import { inspectCodexContextSource } from '../codex/codex-continuation-source'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'
import { agentContextBindingIsCurrent, type AgentContextBinding } from './agent-context-binding'
import type { OrcaRuntimeService } from './orca-runtime'

function journalMessageCount(sessionId: string): number {
  const snapshot = getStructuredAgentSessionHost()!.journalSnapshot(sessionId)
  return (
    snapshot.submissions.length +
    snapshot.items.filter((item) => item.body.kind === 'message' && item.body.role === 'user')
      .length
  )
}

export async function captureAgentContextTarget(
  runtime: OrcaRuntimeService,
  binding: AgentContextBinding
): Promise<AgentContextTransitionTarget> {
  const source = await runtime.resolveConversationContinuationSource(binding)
  const activity = await inspectCodexContextSource(source)
  if (!activity.turnId || activity.turnState !== 'running' || !activity.activityReliable) {
    throw new Error('agent_context_active_turn_unverified')
  }
  return {
    ...binding,
    turnId: activity.turnId,
    userMessageCount: activity.userMessageCount,
    ...(binding.sessionId
      ? { journalUserMessageCount: journalMessageCount(binding.sessionId) }
      : {})
  }
}

export async function inspectAgentContextBoundary(
  runtime: OrcaRuntimeService,
  request: AgentContextTransitionRequest
): Promise<AgentContextTransitionDependencyInspection> {
  const target = request.target
  try {
    if (!(await agentContextBindingIsCurrent(runtime, target))) {
      return { status: 'stale', errorCode: 'agent_context_owner_changed' }
    }
    const source = await runtime.resolveConversationContinuationSource(target)
    const activity = await inspectCodexContextSource(source)
    if (
      activity.turnId !== target.turnId ||
      activity.userMessageCount !== target.userMessageCount
    ) {
      return { status: 'stale', errorCode: 'agent_context_new_input' }
    }
    if (activity.turnState === 'interrupted') {
      return { status: 'stopped' }
    }
    if (!activity.activityReliable) {
      return { status: 'unverifiable', errorCode: 'agent_context_input_unverifiable' }
    }
    if (target.sessionId) {
      const host = getStructuredAgentSessionHost()!
      await host.flushStreamedEvents(target.sessionId)
      if (journalMessageCount(target.sessionId) !== target.journalUserMessageCount) {
        return { status: 'stale', errorCode: 'agent_context_new_input' }
      }
      const snapshot = host.journalSnapshot(target.sessionId)
      if (
        snapshot.items.some(
          (item) =>
            item.body.kind === 'status' &&
            item.body.turnLifecycle?.turnId === target.turnId &&
            ['cancelled', 'failed'].includes(item.body.turnLifecycle.state)
        )
      ) {
        return { status: 'stopped' }
      }
      if (
        activeStructuredAgentSessionTurnId(snapshot.items) ||
        snapshot.submissions.some(
          (item) => item.dispatchState === 'pending' || item.dispatchState === 'unknown'
        ) ||
        snapshot.items.some(
          (item) =>
            (item.body.kind === 'tool-call' && item.body.state === 'running') ||
            ((item.body.kind === 'approval' || item.body.kind === 'question') &&
              item.body.resolution.state === 'pending')
        ) ||
        host.deps.adapter.backgroundTaskState?.(target.sessionId)?.state === 'monitoring'
      ) {
        return { status: 'waiting' }
      }
    } else if (target.paneKey) {
      const status = runtime.getAgentContextPaneSnapshot(target.paneKey)
      if (status?.interrupted) {
        return { status: 'stopped' }
      }
      if (
        !status ||
        status.state !== 'done' ||
        status.restoredUnconfirmed ||
        status.subagents?.some((agent) => agent.state === 'working')
      ) {
        return { status: 'waiting' }
      }
    }
    return activity.checkpoint?.lastTurnId === target.turnId &&
      activity.turnState === 'completed' &&
      !runtime.isConversationContinuationBusy(target.providerSessionId)
      ? { status: 'ready', revision: activity.checkpoint.revision }
      : { status: 'waiting' }
  } catch {
    return { status: 'unverifiable', errorCode: 'agent_context_boundary_unverifiable' }
  }
}
