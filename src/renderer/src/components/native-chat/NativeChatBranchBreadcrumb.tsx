import { useMemo, useState, useSyncExternalStore } from 'react'
import { CornerUpLeft, GitBranch, ListTree } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import {
  conversationBranchMemberSurface,
  openConversationBranchMember
} from '@/lib/conversation-branch-members'
import { conversationBranchChat } from '../../../../shared/conversation-branch-relatives'
import { getStructuredAgentSessionStatusFeed } from '@/runtime/structured-agent-session-status-feed'
import { conversationBranchOf } from '../../../../shared/conversation-branch'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { ConversationBranchFamilyPanel } from '../conversation-branch/ConversationBranchFamilyPanel'
import { conversationBranchErrorText } from '../conversation-branch/conversation-branch-error-text'
import { useConversationBranches } from '../conversation-branch/use-conversation-branches'
import { useStructuredAgentSessionStatusSummary } from './StructuredAgentSessionStatusBridge'

const ACTION_CLASS =
  'flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

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
  const snapshot = useSyncExternalStore(feed.subscribe, feed.getSnapshot)
  const [familyOpen, setFamilyOpen] = useState(false)
  if (!branch || !claudeWorktreeId || !providerSessionId) {
    return null
  }
  const parentId = branch.parent.providerSessionId
  const parentName =
    conversationBranchOf(branches, parentId)?.label ??
    conversationBranchChat(snapshot, parentId)?.conversationName ??
    branch.parent.excerpt
  const returnToBranchPoint = (): void => {
    openConversationBranchMember({
      target: session.target,
      worktreeId: claudeWorktreeId,
      providerSessionId: parentId,
      surface: conversationBranchMemberSurface(branches, parentId),
      ...(branch.parent.turnItemId ? { jumpToItemId: branch.parent.turnItemId } : {})
    }).catch((error: unknown) => toast.error(conversationBranchErrorText(error)))
  }
  return (
    <div
      data-native-chat-find-skip
      className="flex min-w-0 items-center gap-2 border-b border-border py-1 pr-12 pl-3 text-xs text-chat-foreground-faint"
    >
      <GitBranch className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate" title={branch.parent.excerpt}>
        {translate('conversationBranch.breadcrumb', '{{value0}} · branch of {{value1}}', {
          value0: branch.label,
          value1: parentName
        })}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <Popover open={familyOpen} onOpenChange={setFamilyOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={ACTION_CLASS}>
              <ListTree className="size-3.5" />
              {translate('conversationBranch.familyButton', 'Family')}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <ConversationBranchFamilyPanel
              branches={branches}
              providerSessionId={providerSessionId}
              target={session.target}
              worktreeId={claudeWorktreeId}
              onOpened={() => setFamilyOpen(false)}
            />
          </PopoverContent>
        </Popover>
        <button type="button" onClick={returnToBranchPoint} className={ACTION_CLASS}>
          <CornerUpLeft className="size-3.5" />
          {translate('conversationBranch.backToBranchPoint', 'Back to branch point')}
        </button>
      </span>
    </div>
  )
}
