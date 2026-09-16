import React from 'react'
import { MessagesSquare, MoreHorizontal, SquareTerminal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { AgentIcon } from '@/lib/agent-catalog'
import type { useAppStore } from '@/store'
import type { AgentSessionHistoryOpenMode } from '../../../../shared/agent-session-history-open-mode'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { agentLabel } from '../right-sidebar/ai-vault-session-filters'
import type { AiVaultSessionResumeTargetState } from '../right-sidebar/ai-vault-session-resume'
import { SessionTime } from '../right-sidebar/ai-vault-session-time'
import type { AiVaultSessionWorktreeInfo } from '../right-sidebar/ai-vault-session-worktree'
import { getSessionOpenAvailability } from './conversation-history-open-availability'

function DisabledHistoryAction({
  label,
  reason,
  icon
}: {
  label: string
  reason: string
  icon: React.ReactNode
}): React.JSX.Element {
  const item = (
    <DropdownMenuItem disabled aria-label={`${label}. ${reason}`}>
      {icon}
      {label}
    </DropdownMenuItem>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>{item}</div>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={8} className="max-w-64">
        {reason}
      </TooltipContent>
    </Tooltip>
  )
}

export function ConversationHistorySessionRow({
  session,
  worktree,
  worktreeInfo,
  targetState,
  settings,
  onOpen
}: {
  session: AiVaultSession
  worktree: Worktree
  worktreeInfo: AiVaultSessionWorktreeInfo | null
  targetState: AiVaultSessionResumeTargetState
  settings: ReturnType<typeof useAppStore.getState>['settings']
  onOpen: (session: AiVaultSession, mode: AgentSessionHistoryOpenMode, worktreeId: string) => void
}): React.JSX.Element {
  const availability = getSessionOpenAvailability({
    session,
    worktree,
    worktreeInfo,
    targetState,
    settings
  })
  const terminalLabel = translate(
    'auto.components.sidebar.WorktreeConversationHistory.openInTerminal',
    'Open in Terminal'
  )
  const structuredLabel = translate(
    'auto.components.sidebar.WorktreeConversationHistory.openInStructuredChat',
    'New {{value0}} Chat',
    { value0: agentLabel(session.agent) }
  )
  const preferredLabel = availability.preferredMode === 'terminal' ? terminalLabel : structuredLabel
  const openPreferred = (): void => {
    if (availability.preferredReason) {
      toast.error(availability.preferredReason)
      return
    }
    onOpen(session, availability.preferredMode, worktree.id)
  }

  return (
    <div className="group/history-row flex h-6 min-w-0 items-center rounded-md hover:bg-worktree-sidebar-accent focus-within:bg-worktree-sidebar-accent">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-worktree-sidebar-ring"
            aria-disabled={Boolean(availability.preferredReason)}
            onClick={openPreferred}
          >
            <span
              role="img"
              aria-label={agentLabel(session.agent)}
              className="inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground"
            >
              <AgentIcon agent={session.agent} size={12} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-4 text-foreground">
              {session.title}
            </span>
            <SessionTime
              value={session.updatedAt ?? session.modifiedAt}
              className="text-[10px] tabular-nums"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="max-w-64">
          <div className="min-w-0">
            <div className="break-words font-medium">{session.title}</div>
            <div className="mt-0.5 text-muted-foreground">
              {agentLabel(session.agent)} · {availability.preferredReason ?? preferredLabel}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="mr-0.5 size-5 shrink-0 text-muted-foreground can-hover:opacity-0 group-hover/history-row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label={translate(
              'auto.components.sidebar.WorktreeConversationHistory.moreActions',
              'More conversation actions'
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {availability.terminalReason ? (
            <DisabledHistoryAction
              label={terminalLabel}
              reason={availability.terminalReason}
              icon={<SquareTerminal className="size-3.5" />}
            />
          ) : (
            <DropdownMenuItem onSelect={() => onOpen(session, 'terminal', worktree.id)}>
              <SquareTerminal className="size-3.5" />
              {terminalLabel}
            </DropdownMenuItem>
          )}
          {availability.structuredReason ? (
            <DisabledHistoryAction
              label={structuredLabel}
              reason={availability.structuredReason}
              icon={<MessagesSquare className="size-3.5" />}
            />
          ) : (
            <DropdownMenuItem onSelect={() => onOpen(session, 'structured', worktree.id)}>
              <MessagesSquare className="size-3.5" />
              {structuredLabel}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
