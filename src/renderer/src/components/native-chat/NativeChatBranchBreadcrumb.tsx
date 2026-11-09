import { useMemo, useSyncExternalStore } from 'react'
import { CornerUpLeft, GitBranch } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { activateStructuredAgentSessionById } from '@/lib/structured-agent-session-tab-activation'
import { revealStructuredSession } from '@/lib/activate-ai-vault-structured-session'
import { getStructuredAgentSessionStatusFeed } from '@/runtime/structured-agent-session-status-feed'
import {
  conversationBranchOf,
  type ConversationBranchRecord
} from '../../../../shared/conversation-branch'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { useConversationBranches } from '../conversation-branch/use-conversation-branches'
import { useStructuredAgentSessionStatusSummary } from './StructuredAgentSessionStatusBridge'
import { requestNativeChatRailJump } from './native-chat-requested-rail-jump'

/** Opens the chat the branch started from and scrolls it to the prompt of the forked turn. */
async function returnToBranchPoint(
  branch: ConversationBranchRecord,
  worktreeId: string,
  target: RuntimeClientTarget
): Promise<void> {
  const parentSessionId = branch.parent.structuredSessionId
  if (!parentSessionId) {
    return
  }
  if (branch.parent.turnItemId) {
    requestNativeChatRailJump(branch.parent.turnItemId)
  }
  if (!activateStructuredAgentSessionById({ worktreeId, sessionId: parentSessionId, target })) {
    await revealStructuredSession({ worktreeId, sessionId: parentSessionId, target })
  }
}

/** "Branch of …": shown in a chat that was branched from another, with the way back. */
export function NativeChatBranchBreadcrumb({
  session,
  worktreeId
}: {
  session: { sessionId: string; agent: AgentType; target: RuntimeClientTarget }
  worktreeId: string | null | undefined
}): React.JSX.Element | null {
  const claudeWorktreeId = session.agent === 'claude' ? (worktreeId ?? null) : null
  const { branches } = useConversationBranches(session.target, claudeWorktreeId)
  const providerSessionId =
    useStructuredAgentSessionStatusSummary(session.sessionId, session.target).summary
      ?.providerSession?.id ?? null
  const branch = providerSessionId ? conversationBranchOf(branches, providerSessionId) : null
  const feed = useMemo(() => getStructuredAgentSessionStatusFeed(session.target), [session.target])
  const parentName = useSyncExternalStore(feed.subscribe, () =>
    branch?.parent.structuredSessionId
      ? (feed.getSnapshot().get(branch.parent.structuredSessionId)?.conversationName ?? null)
      : null
  )
  if (!branch || !claudeWorktreeId) {
    return null
  }
  const canReturn = Boolean(branch.parent.structuredSessionId)
  return (
    <div
      data-native-chat-find-skip
      className="flex min-w-0 items-center gap-2 border-b border-border py-1 pr-12 pl-3 text-xs text-chat-foreground-faint"
    >
      <GitBranch className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate" title={branch.parent.excerpt}>
        {translate('conversationBranch.breadcrumb', '{{value0}} · branch of {{value1}}', {
          value0: branch.label,
          value1: parentName ?? branch.parent.excerpt
        })}
      </span>
      {canReturn ? (
        <button
          type="button"
          onClick={() => void returnToBranchPoint(branch, claudeWorktreeId, session.target)}
          className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CornerUpLeft className="size-3.5" />
          {translate('conversationBranch.backToBranchPoint', 'Back to branch point')}
        </button>
      ) : null}
    </div>
  )
}
