import { useMemo } from 'react'
import { Circle, CircleCheck, CircleDot } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { nativeChatTaskLabel } from '../../../../shared/native-chat-task-list'
import { NativeChatCodeBlock } from './NativeChatCodeBlock'
import { NativeChatMarkdown } from './NativeChatMarkdown'
import { nativeChatSidePanelPlan } from './native-chat-side-panel-findings'
import type { NativeChatSidePanelFeed } from './native-chat-side-panel-context'

const TASK_ICONS = { pending: Circle, in_progress: CircleDot, completed: CircleCheck } as const

/** The Plan tab: the newest plan the agent proposed and the task list it keeps, so both stay in
 *  view once the conversation has moved past them. */
export function NativeChatSidePanelPlan({
  feed
}: {
  feed: NativeChatSidePanelFeed
}): React.JSX.Element {
  const { plan, tasks } = useMemo(
    () => nativeChatSidePanelPlan(feed.conversation ?? []),
    [feed.conversation]
  )
  if (!plan && !tasks) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        {translate(
          'components.native-chat.sidePanel.noPlan',
          'No plan or task list in this conversation yet.'
        )}
      </p>
    )
  }
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 scrollbar-sleek">
      {tasks && tasks.tasks.length > 0 ? (
        <section aria-label={translate('components.native-chat.sidePanel.tasks', 'Tasks')}>
          <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
            {translate('components.native-chat.sidePanel.tasks', 'Tasks')}
          </h3>
          <ul className="space-y-1">
            {tasks.tasks.map((task, index) => {
              const Icon = TASK_ICONS[task.status]
              return (
                <li key={`${index}:${task.content}`} className="flex items-start gap-2 text-sm">
                  <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span
                    className={cn(
                      'min-w-0 break-words',
                      task.status === 'completed'
                        ? 'text-muted-foreground line-through'
                        : 'text-foreground'
                    )}
                  >
                    {nativeChatTaskLabel(task)}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
      {plan ? (
        <section aria-label={translate('components.native-chat.sidePanel.plan', 'Plan')}>
          <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
            {translate('components.native-chat.sidePanel.plan', 'Plan')}
          </h3>
          <NativeChatMarkdown
            content={plan}
            variant="document"
            className="text-sm text-chat-foreground"
            renderCodeBlock={NativeChatCodeBlock}
          />
        </section>
      ) : null}
    </div>
  )
}
