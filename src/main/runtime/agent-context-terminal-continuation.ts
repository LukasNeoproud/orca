import {
  agentContextTransitionPolicyAllows,
  type AgentContextTransitionRequest
} from '../../shared/agent-context-transition'
import { makePaneKey } from '../../shared/stable-pane-id'
import { inspectCodexContextSource } from '../codex/codex-continuation-source'
import type { OrcaRuntimeService } from './orca-runtime'

export async function continueAgentContextTerminal(
  runtime: OrcaRuntimeService,
  request: AgentContextTransitionRequest,
  providerSessionId: string,
  userMessageCount: number
): Promise<string> {
  const terminals = await runtime.listTerminals(`id:${request.target.workspaceId}`)
  const terminal = terminals.terminals.find(
    (entry) => makePaneKey(entry.tabId, entry.leafId) === request.target.paneKey
  )
  if (!terminal || !request.input.checkpoint.nextStep) {
    throw new Error('agent_context_continuation_target_unavailable')
  }
  await runtime.sendTerminalAgentPrompt(terminal.handle, request.input.checkpoint.nextStep, {
    beforeWrite: async () => {
      const status = runtime.getAgentContextPaneSnapshot(request.target.paneKey!)
      if (
        status?.providerSession?.id !== providerSessionId ||
        status.state !== 'done' ||
        status.interrupted ||
        !agentContextTransitionPolicyAllows(
          runtime.getConversationContinuationSettings().agentContextAutonomy ?? 'off',
          request.input
        )
      ) {
        throw new Error('agent_context_continuation_target_changed')
      }
      const source = await runtime.resolveConversationContinuationSource({
        workspaceId: request.target.workspaceId,
        providerSessionId
      })
      const activity = await inspectCodexContextSource(source)
      if (!activity.activityReliable || activity.userMessageCount !== userMessageCount) {
        throw new Error('agent_context_continuation_new_input')
      }
    }
  })
  return terminal.handle
}
