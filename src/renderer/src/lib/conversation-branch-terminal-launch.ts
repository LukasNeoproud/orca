// Opens a branch as Claude in a terminal, its prompt prefilled and unsent (`--prefill`), so a
// terminal branch starts no work either. Full and summarized branches resume the fork the host
// wrote; a clean one starts the fresh conversation id the host recorded for it.

import { adoptAgentSessionLaunchVerdict } from '@/lib/agent-session-launch-plan'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { activateLiveProviderSessionPane } from '@/components/right-sidebar/ai-vault-running-pane-activation'
import { refreshConversationBranches } from '@/components/conversation-branch/use-conversation-branches'
import { prepareConversationBranch } from '@/runtime/conversation-branch-client'
import { useAppStore } from '@/store'
import { resolveTuiAgentLaunchArgs } from '../../../shared/tui-agent-launch-defaults'
import type { ConversationBranchRecord } from '../../../shared/conversation-branch'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import type { ConversationBranchChatRequest } from './conversation-branch-launch'

/** The Claude arguments that open `providerSessionId`: resumed, or started fresh under that id. */
export function conversationBranchTerminalArgs(
  defaultArgs: string,
  providerSessionId: string,
  fresh: boolean
): string {
  return [defaultArgs.trim(), fresh ? '--session-id' : '--resume', providerSessionId]
    .filter(Boolean)
    .join(' ')
}

/** A new terminal running Claude on `providerSessionId` with `prompt` waiting unsent. */
export function openBranchTerminal(args: {
  worktreeId: string
  providerSessionId: string
  prompt: string
  /** The conversation does not exist yet: Claude starts it under this id. */
  fresh?: boolean
  label?: string
}): void {
  const settings = useAppStore.getState().settings
  const result = launchAgentInNewTab({
    // The terminal is the point: a person who prefers chats picks the chat output instead.
    agentSessionLaunchPlan: adoptAgentSessionLaunchVerdict({
      route: 'terminal-tui',
      requestId: newAgentLaunchRequestId(),
      agent: 'claude',
      worktreeId: args.worktreeId
    }),
    agent: 'claude',
    worktreeId: args.worktreeId,
    agentArgs: conversationBranchTerminalArgs(
      resolveTuiAgentLaunchArgs('claude', settings?.agentDefaultArgs),
      args.providerSessionId,
      args.fresh === true
    ),
    prompt: args.prompt,
    promptDelivery: 'draft',
    launchSource: 'terminal_context_menu'
  })
  if (!result) {
    throw new Error('conversation_branch_unavailable')
  }
  if (args.label && result.surface.kind === 'local-terminal') {
    useAppStore
      .getState()
      .setTabCustomTitle(result.surface.tabId, args.label, { recordInteraction: false })
  }
}

/** Focuses the terminal running this conversation, else resumes it in a new one. */
export function openConversationBranchTerminalMember(args: {
  worktreeId: string
  providerSessionId: string
}): void {
  if (!activateLiveProviderSessionPane('claude', args.providerSessionId)) {
    openBranchTerminal({ ...args, prompt: '' })
  }
}

/** Prepares the branch on the host, then opens it in a terminal. */
export async function startConversationBranchInTerminal(
  target: RuntimeClientTarget,
  request: ConversationBranchChatRequest
): Promise<ConversationBranchRecord> {
  const { prompt, ...prepare } = request
  try {
    const branch = await prepareConversationBranch(target, { ...prepare, surface: 'terminal' })
    const childId = branch.child.providerSessionId
    if (!childId) {
      throw new Error('conversation_branch_fork_unverified')
    }
    openBranchTerminal({
      worktreeId: request.worktreeId,
      providerSessionId: childId,
      prompt,
      fresh: request.mode === 'clean',
      label: request.label
    })
    return branch
  } finally {
    void refreshConversationBranches(target, request.worktreeId)
  }
}
