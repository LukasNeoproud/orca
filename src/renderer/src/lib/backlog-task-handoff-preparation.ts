import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import type {
  BacklogTaskAssociationSession,
  BacklogTaskAssociationTerminal
} from '../../../shared/backlog-task-association'
import { isResumableTuiAgent } from '../../../shared/agent-session-resume'
import { isAgentSessionHandleProvider } from '../../../shared/agent-session-provider-handle'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import type { TuiAgent } from '../../../shared/tui-agent'
import { isTuiAgentEnabled } from '../../../shared/tui-agent-selection'
import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { detectAgentSessionContinuationAgents } from '@/lib/launch-agent-session-continuation'
import { resolveAgentLaunchRoute } from '@/lib/agent-launch-routing'
import { startStructuredAgentLaunch } from '@/lib/structured-agent-session-launch'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'
import type { BacklogRoute } from './backlog-rpc'
import { activateBacklogTaskWorkspace } from './backlog-task-conversation-activation'

export type PreparedBacklogConversation = {
  surface: 'structured' | 'terminal'
  agent: TuiAgent
  session: BacklogTaskAssociationSession
  terminal?: BacklogTaskAssociationTerminal
  structuredFence?: number
  launchedTerminal?: boolean
}

async function assertAgentAvailable(agent: TuiAgent, route: BacklogRoute): Promise<void> {
  if (!isTuiAgentEnabled(agent, useAppStore.getState().settings?.disabledTuiAgents)) {
    throw new Error('The selected agent is disabled in Agent settings.')
  }
  const host = parseExecutionHostId(route.executionHostId)
  const detected = route.runtimeEnvironmentId
    ? await callRuntimeRpc<TuiAgent[]>(
        { kind: 'environment', environmentId: route.runtimeEnvironmentId },
        host?.kind === 'ssh' ? 'preflight.detectRemoteAgents' : 'preflight.detectAgents',
        host?.kind === 'ssh' ? { connectionId: host.targetId } : undefined
      )
    : host?.kind === 'ssh'
      ? await useAppStore.getState().ensureRemoteDetectedAgents(host.targetId)
      : await detectAgentSessionContinuationAgents(route.workspaceId)
  if (!detected.includes(agent)) {
    throw new Error('The selected agent is not available on the target workspace host.')
  }
}

export async function prepareNewBacklogConversation(
  route: BacklogRoute,
  agent: TuiAgent,
  requestedSurface: 'auto' | 'structured'
): Promise<PreparedBacklogConversation> {
  if (!activateBacklogTaskWorkspace(route)) {
    throw new Error('The target workspace is no longer available.')
  }
  await assertAgentAvailable(agent, route)
  const launchRoute =
    requestedSurface === 'structured'
      ? 'structured-native-chat'
      : resolveAgentLaunchRoute({
          agent,
          settings: useAppStore.getState().settings,
          executionHostId: route.executionHostId,
          hostCapabilities: null,
          workspaceKind:
            parseWorkspaceKey(route.workspaceId)?.type === 'folder' ? 'folder' : 'git-worktree'
        })
  if (launchRoute === 'structured-native-chat') {
    if (!isAgentSessionHandleProvider(agent)) {
      throw new Error('The selected agent does not support structured conversations.')
    }
    if (route.executionHostId !== 'local' || route.runtimeEnvironmentId !== null) {
      throw new Error('New structured conversations are available only on the local host.')
    }
    const receipt = await startStructuredAgentLaunch(route.workspaceId, agent, {
      requestId: newAgentLaunchRequestId()
    }).launchResult
    return {
      surface: 'structured',
      agent,
      session: { structuredSessionId: receipt.sessionId },
      structuredFence: receipt.fence
    }
  }
  const launched = await launchAgentBackgroundSession({
    agent,
    worktreeId: route.workspaceId,
    executionHostId: route.executionHostId,
    runtimeEnvironmentId: route.runtimeEnvironmentId,
    launchSource: 'sidebar'
  })
  if (!launched) {
    throw new Error('The agent conversation could not be started.')
  }
  const separator = launched.paneKey.indexOf(':')
  const leafId = separator === -1 ? undefined : launched.paneKey.slice(separator + 1)
  return {
    surface: 'terminal',
    agent,
    session: {},
    terminal: {
      tabId: launched.tabId,
      ...(leafId ? { leafId } : {}),
      paneKey: launched.paneKey,
      ptyId: launched.ptyId,
      ...(isResumableTuiAgent(agent) ? { launchAgent: agent } : {})
    },
    launchedTerminal: true
  }
}
