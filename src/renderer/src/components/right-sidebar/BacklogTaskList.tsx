import { useEffect, useRef } from 'react'
import { MessageSquare } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { BacklogTask } from '../../../../shared/backlog-types'

export function BacklogTaskList({
  tasks,
  linked,
  visible,
  selectedId,
  onOpen
}: {
  tasks: BacklogTask[]
  linked: ReadonlySet<string>
  visible: boolean
  selectedId: string | null
  onOpen: (id: string) => void
}): React.JSX.Element {
  const list = useRef<HTMLUListElement>(null)
  const lastFocused = useRef<string | null>(null)
  const wasVisible = useRef(visible)
  const scrollOffset = useRef(0)
  useEffect(() => {
    if (visible && !wasVisible.current) {
      if (list.current) {
        list.current.scrollTop = scrollOffset.current
      }
      const buttons = list.current?.querySelectorAll<HTMLButtonElement>('[data-task-id]')
      const target =
        Array.from(buttons ?? []).find((button) => button.dataset.taskId === lastFocused.current) ??
        buttons?.[0]
      target?.focus({ preventScroll: true })
    }
    wasVisible.current = visible
  }, [visible])
  return (
    <ul
      ref={list}
      aria-label={translate('components.backlog.tasks', 'Tasks')}
      onScroll={() => {
        if (visible && list.current) {
          scrollOffset.current = list.current.scrollTop
        }
      }}
      className="min-h-0 flex-1 overflow-y-auto p-1 scrollbar-sleek"
      onKeyDown={(event) => {
        const buttons = Array.from(
          list.current?.querySelectorAll<HTMLButtonElement>('[data-task-id]') ?? []
        )
        const index = buttons.indexOf(event.target as HTMLButtonElement)
        if (index === -1) {
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          onOpen(tasks[index]!.id)
          return
        }
        const next =
          event.key === 'ArrowDown'
            ? Math.min(index + 1, buttons.length - 1)
            : event.key === 'ArrowUp'
              ? Math.max(0, index - 1)
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
    >
      {tasks.map((task) => (
        <li key={task.id}>
          <button
            type="button"
            data-task-id={task.id}
            data-current={selectedId === task.id || undefined}
            onFocus={() => {
              lastFocused.current = task.id
            }}
            onClick={() => {
              lastFocused.current = task.id
              onOpen(task.id)
            }}
            className="w-full rounded-md px-2 py-2 text-left hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
          >
            <span className="line-clamp-2 break-words text-[13px] font-medium leading-snug">
              {task.title}
            </span>
            <span className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-mono">{task.id}</span> · {task.status}
              </span>
              {linked.has(task.id) ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      role="img"
                      aria-label={translate(
                        'components.backlog.linkedConversation',
                        'Linked conversation'
                      )}
                    >
                      <MessageSquare className="size-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {translate(
                      'components.backlog.linkedConversationHint',
                      'Linked conversation; does not indicate agent activity.'
                    )}
                  </TooltipContent>
                </Tooltip>
              ) : null}
              {task.priority ? (
                <span className="max-w-20 shrink-0 truncate">{task.priority}</span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
