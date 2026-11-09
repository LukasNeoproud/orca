import { useMemo, useSyncExternalStore } from 'react'
import { CornerDownRight, MessagesSquare } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { openConversationBranchMember } from '@/lib/conversation-branch-members'
import { conversationBranchChat } from '../../../../shared/conversation-branch-relatives'
import { getStructuredAgentSessionStatusFeed } from '@/runtime/structured-agent-session-status-feed'
import { StatusDot } from '../native-chat/NativeChatSubagentRun'
import { conversationBranchErrorText } from './conversation-branch-error-text'
import { conversationBranchFamily } from '../../../../shared/conversation-branch-family'
import type { ConversationBranchRecord } from '../../../../shared/conversation-branch'
import type { AgentSessionStatusSummary } from '../../../../shared/agent-session-wire'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'

const ROW_CLASS =
  'flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'

function branchDetail(branch: ConversationBranchRecord): string {
  if (branch.state === 'failed') {
    return translate('conversationBranch.stateFailed', 'Not created')
  }
  if (branch.state === 'fork-unverified') {
    return translate('conversationBranch.stateUnverified', 'Unconfirmed')
  }
  if (branch.child.surface === 'terminal') {
    return translate('conversationBranch.surfaceTerminal', 'Terminal')
  }
  return branch.mode === 'compact'
    ? translate('conversationBranch.modeCompactShort', 'Summarized')
    : branch.mode === 'clean'
      ? translate('conversationBranch.modeCleanShort', 'New conversation')
      : translate('conversationBranch.modeFullShort', 'Whole conversation')
}

function MemberStatus({ chat }: { chat: AgentSessionStatusSummary | null }): React.JSX.Element {
  const status = chat?.status ?? null
  return (
    <StatusDot
      state={status === 'working' || status === 'attention' ? 'working' : 'idle'}
      pulsing={status === 'working'}
    />
  )
}

/** The conversation's family: the original, each turn branches started after, and the branches. */
export function ConversationBranchFamilyPanel({
  branches,
  providerSessionId,
  target,
  worktreeId,
  onOpened
}: {
  branches: readonly ConversationBranchRecord[]
  /** The conversation the panel is shown from, marked as current. */
  providerSessionId: string
  target: RuntimeClientTarget
  worktreeId: string
  onOpened: () => void
}): React.JSX.Element {
  const family = useMemo(
    () => conversationBranchFamily(branches, providerSessionId),
    [branches, providerSessionId]
  )
  const feed = useMemo(() => getStructuredAgentSessionStatusFeed(target), [target])
  const snapshot = useSyncExternalStore(feed.subscribe, feed.getSnapshot)
  const open = (memberId: string, jumpToItemId?: string): void => {
    onOpened()
    openConversationBranchMember({
      target,
      worktreeId,
      providerSessionId: memberId,
      ...(jumpToItemId ? { jumpToItemId } : {})
    }).catch((error: unknown) => toast.error(conversationBranchErrorText(error)))
  }
  const rootChat = conversationBranchChat(snapshot, family.rootProviderSessionId)
  const rootCurrent = family.rootProviderSessionId === providerSessionId

  return (
    <div
      role="group"
      aria-label={translate('conversationBranch.family', 'Conversation family')}
      className="max-h-80 space-y-1 overflow-y-auto text-xs scrollbar-sleek"
    >
      <button
        type="button"
        aria-current={rootCurrent || undefined}
        className={ROW_CLASS}
        onClick={() => !rootCurrent && open(family.rootProviderSessionId)}
      >
        <MessagesSquare className="size-3.5 shrink-0" />
        <span className={cn('min-w-0 flex-1 truncate', rootCurrent && 'font-semibold')}>
          {rootChat?.conversationName ??
            translate('conversationBranch.original', 'Original conversation')}
        </span>
        <MemberStatus chat={rootChat} />
      </button>
      {family.points.map((point) => (
        <div key={point.key} style={{ paddingInlineStart: point.depth * 12 }}>
          <button
            type="button"
            className={cn(ROW_CLASS, 'text-muted-foreground')}
            title={point.excerpt}
            onClick={() =>
              open(point.parentProviderSessionId, point.branches[0]?.parent.turnItemId)
            }
          >
            <CornerDownRight className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{point.excerpt}</span>
          </button>
          <ul className="ml-3 border-l border-border pl-1.5">
            {point.branches.map((branch) => {
              const childId = branch.child.providerSessionId
              const current = childId === providerSessionId
              const chat = childId ? conversationBranchChat(snapshot, childId) : null
              return (
                <li key={branch.branchId}>
                  <button
                    type="button"
                    aria-current={current || undefined}
                    className={ROW_CLASS}
                    // Terminal branches open from the terminal until it can resume them here.
                    disabled={!childId || branch.child.surface === 'terminal'}
                    onClick={() => childId && !current && open(childId)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate', current && 'font-semibold')}>
                        {branch.label}
                      </span>
                      <span className="block truncate text-muted-foreground">
                        {branchDetail(branch)}
                      </span>
                    </span>
                    <MemberStatus chat={chat} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
