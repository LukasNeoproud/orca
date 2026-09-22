import { MessageSquare, FolderOpen } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { getAgentCatalog } from '@/lib/agent-catalog'
import type { BacklogTaskAssociation } from '../../../../shared/backlog-task-association'

export function useBacklogAssociationContext(association: BacklogTaskAssociation | null) {
  const targetId = association?.targetWorkspace.workspaceId
  const workspace = useAppStore((state) =>
    targetId
      ? state.getKnownWorktreeById(targetId, state.activeWorkspaceExecutionHostId ?? 'local')
      : undefined
  )
  const title = useAppStore((state) => {
    if (!association || !targetId) {
      return ''
    }
    const structuredTitle = association.session.structuredSessionId
      ? state.unifiedTabsByWorktree[targetId]?.find(
          (tab) =>
            (tab.executionHostId ?? 'local') ===
              (state.activeWorkspaceExecutionHostId ?? 'local') &&
            tab.contentType === 'agent-session' &&
            tab.entityId === association.session.structuredSessionId
        )?.label
      : undefined
    return (
      structuredTitle ?? association.session.title ?? association.session.providerSession?.id ?? ''
    )
  })
  const agentId = association?.session.agent ?? association?.terminal?.launchAgent
  const agent = getAgentCatalog().find((entry) => entry.id === agentId)?.label ?? agentId
  return { workspace, title, agent, unavailable: Boolean(association && !workspace) }
}

export function BacklogAssociationContext({
  context
}: {
  context: ReturnType<typeof useBacklogAssociationContext>
}): React.JSX.Element {
  return (
    <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2">
        <FolderOpen className="size-3.5 shrink-0" />
        <span className="truncate">
          {context.workspace?.displayName ??
            translate('components.backlog.workspaceUnavailable', 'Workspace unavailable')}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <MessageSquare className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">
          {[context.agent, context.title].filter(Boolean).join(' · ') ||
            translate('components.backlog.linkedConversation', 'Linked conversation')}
        </span>
      </div>
    </div>
  )
}
