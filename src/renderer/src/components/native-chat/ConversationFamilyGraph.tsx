import { CornerDownRight, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { conversationFamilyGraph } from './conversation-family-graph'
import type { AgentSessionBranchRecord } from '../../../../shared/agent-session-branch'

export function ConversationFamilyGraph({
  branches,
  sessionId,
  targetAliases,
  onOpen,
  onSource
}: {
  branches: readonly AgentSessionBranchRecord[]
  sessionId: string
  targetAliases?: ReadonlyMap<string, readonly string[]>
  onOpen: (branch: AgentSessionBranchRecord) => void
  onSource: (branch: AgentSessionBranchRecord) => void
}): React.JSX.Element {
  return (
    <div
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
          return
        }
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        )
        const current = buttons.indexOf(event.target as HTMLButtonElement)
        if (current === -1) {
          return
        }
        const next =
          event.key === 'ArrowDown'
            ? Math.min(current + 1, buttons.length - 1)
            : event.key === 'ArrowUp'
              ? Math.max(current - 1, 0)
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : null
        if (next !== null) {
          event.preventDefault()
          buttons[next]?.focus()
        }
      }}
      role="group"
      aria-label={translate('conversations.family.graph', 'Conversation origins')}
      className="max-h-64 space-y-3 overflow-auto text-xs scrollbar-sleek"
    >
      {conversationFamilyGraph(branches, targetAliases).map((point) => (
        <div
          key={point.key}
          className={cn(
            point.depth > 0 && 'border-l border-border pl-2',
            ['ml-0', 'ml-3', 'ml-6', 'ml-9', 'ml-12'][Math.min(point.depth, 4)]
          )}
        >
          <Button
            size="xs"
            variant="ghost"
            className="h-auto max-w-full justify-start gap-1 py-1 text-left text-muted-foreground"
            onClick={() => onSource(point.branches[0]!)}
          >
            <GitBranch className="size-3 shrink-0" />
            <span className="line-clamp-2">
              {point.branches[0]!.source.excerpt ||
                translate('conversations.family.sourceResponse', 'Source response')}
            </span>
          </Button>
          <ul className="ml-2 border-l border-border pl-2">
            {point.branches.map((branch) => (
              <li key={branch.branchId}>
                <Button
                  size="xs"
                  variant="ghost"
                  data-current={branch.target.sessionId === sessionId || undefined}
                  className={cn(
                    'h-auto w-full justify-start py-1 text-left',
                    branch.target.sessionId === sessionId && 'bg-accent'
                  )}
                  onClick={() => onOpen(branch)}
                >
                  <CornerDownRight className="size-3 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{branch.title}</span>
                    <span className="font-normal text-muted-foreground">
                      {branch.relationKind === 'alternative'
                        ? translate('conversations.family.alternative', 'Alternative solution')
                        : branch.relationKind === 'subtask'
                          ? translate('conversations.family.subtask', 'Subtask')
                          : translate('conversations.family.discussion', 'Side discussion')}
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
