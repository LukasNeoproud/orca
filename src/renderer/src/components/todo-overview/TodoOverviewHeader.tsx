import React from 'react'
import { ListTodo, Loader2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { TodoOverview } from './use-todo-overview'

function HeaderIconButton({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** Takes the query field's place while the Contents view lists TODO and FIXME comments. */
export function TodoOverviewHeader({ todo }: { todo: TodoOverview }): React.JSX.Element {
  return (
    <div className="flex h-7 items-center gap-1 px-1.5" data-ignore-file-explorer-keys="true">
      <ListTodo className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
        {translate('todoOverview.title', 'TODO and FIXME')}
      </span>
      {todo.state.loading ? (
        <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
      ) : null}
      <HeaderIconButton
        label={translate('todoOverview.refresh', 'Search again')}
        onClick={todo.refresh}
      >
        <RefreshCw className="size-3.5" />
      </HeaderIconButton>
      <HeaderIconButton
        label={translate('todoOverview.close', 'Back to text search')}
        onClick={() => todo.setOpen(false)}
      >
        <X className="size-3.5" />
      </HeaderIconButton>
    </div>
  )
}

/** Entry point under the Contents search filters. */
export function TodoOverviewOpenButton({ todo }: { todo: TodoOverview }): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="mt-1 w-full justify-start"
      onClick={() => todo.setOpen(true)}
    >
      <ListTodo className="size-3.5" />
      {translate('todoOverview.open', 'Show TODO and FIXME comments')}
    </Button>
  )
}
