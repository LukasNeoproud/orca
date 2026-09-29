import { ArrowUpRight, SquareTerminal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'
import { formatCpu, formatMemory } from '../status-bar/resource-usage-metrics'
import type { ManagerRow } from './agent-manager-model'
import { AgentManagerPreview } from './AgentManagerPreview'

export function managerStateLabel(state: ManagerRow['state']): string {
  switch (state) {
    case 'working':
      return translate('agents.manager.working', 'Working')
    case 'waiting':
      return translate('agents.manager.waiting', 'Waiting for input')
    case 'blocked':
      return translate('agents.manager.blocked', 'Needs attention')
    case 'done':
      return translate('agents.manager.done', 'Turn completed')
    case 'running':
      return translate('agents.manager.running', 'Running')
    case 'exited':
      return translate('agents.manager.exited', 'Exited')
    case 'unknown':
      return translate('agents.manager.unknownState', 'Status unknown')
  }
}

function Timestamp({ at, now }: { at: number | null; now: number }) {
  if (at === null) {
    return (
      <span className="text-muted-foreground">
        {translate('agents.manager.unknown', 'Unknown')}
      </span>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          tabIndex={0}
          dateTime={new Date(at).toISOString()}
          className="whitespace-nowrap tabular-nums"
        >
          {formatUiRelativeTime(at - now)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{new Date(at).toLocaleString()}</TooltipContent>
    </Tooltip>
  )
}

function Binding({ binding }: { binding: ManagerRow['binding'] }) {
  const label =
    binding === 'bound'
      ? translate('agents.manager.attached', 'Attached')
      : binding === 'orphan'
        ? translate('agents.manager.orphan', 'Orphan')
        : binding === 'owned'
          ? translate('agents.manager.owned', 'Agent-owned')
          : translate('agents.manager.unknown', 'Unknown')
  return (
    <Badge variant="outline" className="whitespace-nowrap font-normal">
      {label}
    </Badge>
  )
}

type Props = {
  rows: ManagerRow[]
  selected: ReadonlySet<string>
  disabled: boolean
  now: number
  onToggle: (row: ManagerRow) => void
  onToggleAll: () => void
  onNavigate: (row: ManagerRow) => void
  onTerminate: (row: ManagerRow) => void
}

export function AgentManagerTable({
  rows,
  selected,
  disabled,
  now,
  onToggle,
  onToggleAll,
  onNavigate,
  onTerminate
}: Props) {
  const selectable = rows.filter((row) => row.session.isAlive)
  const count = selectable.filter((row) => selected.has(row.key)).length
  const cell = 'px-3 py-3 text-left align-middle'
  return (
    <table
      className="w-full min-w-[960px] text-[13px]"
      aria-label={translate('agents.manager.table', 'Local Orca agents and terminals')}
    >
      <thead className="sticky top-0 z-10 border-b border-border bg-background text-xs text-muted-foreground">
        <tr>
          <th className={cell}>
            <Checkbox
              aria-label={translate(
                'agents.manager.selectVisible',
                'Select all filtered terminals'
              )}
              disabled={disabled || selectable.length === 0}
              checked={count === 0 ? false : count === selectable.length ? true : 'indeterminate'}
              onCheckedChange={onToggleAll}
            />
          </th>
          <th className={cell}>{translate('agents.manager.agent', 'Agent / terminal')}</th>
          <th className={cell}>{translate('agents.manager.status', 'Status')}</th>
          <th className={cell}>{translate('agents.manager.location', 'Project / workspace')}</th>
          <th className={cell}>{translate('agents.manager.cwd', 'Working directory')}</th>
          <th className={cell}>{translate('agents.manager.binding', 'Attachment')}</th>
          <th className={cell}>{translate('agents.manager.created', 'Created')}</th>
          <th className={cell}>{translate('agents.manager.lastUsed', 'Last used')}</th>
          <th className={`${cell} text-right`}>
            {translate('agents.manager.resources', 'CPU / RAM')}
          </th>
          <th className={cell}>
            <span className="sr-only">{translate('agents.manager.actions', 'Actions')}</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((row) => (
          <tr
            key={row.key}
            data-state={selected.has(row.key) ? 'selected' : undefined}
            className="hover:bg-accent/50 data-[state=selected]:bg-accent"
          >
            <td className={cell}>
              <Checkbox
                aria-label={translate('agents.manager.selectRow', 'Select {{name}}', {
                  name: row.label
                })}
                checked={selected.has(row.key)}
                disabled={disabled || !row.session.isAlive}
                onCheckedChange={() => onToggle(row)}
              />
            </td>
            <td className={`${cell} max-w-64`}>
              <AgentManagerPreview session={row.session} label={row.label}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={translate('agents.manager.previewTerminal', 'Preview {{name}}', {
                    name: row.label
                  })}
                >
                  <SquareTerminal className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{row.label}</span>
                </button>
              </AgentManagerPreview>
              <div
                className="mt-1 truncate text-xs text-muted-foreground"
                title={row.session.sessionId}
              >
                {row.provider ?? translate('agents.manager.terminal', 'Terminal')} ·{' '}
                {row.session.pid ? `PID ${row.session.pid}` : row.session.sessionId}
              </div>
            </td>
            <td className={`${cell} whitespace-nowrap`}>{managerStateLabel(row.state)}</td>
            <td className={`${cell} max-w-52`}>
              <div className="truncate">
                {row.independent
                  ? translate('agents.manager.independent', 'Independent')
                  : (row.projectName ?? translate('agents.manager.unassigned', 'Unassigned'))}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {row.workspaceName ?? '—'}
              </div>
            </td>
            <td className={`${cell} max-w-64`}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className="block truncate font-mono text-xs text-muted-foreground"
                  >
                    {row.session.cwd ?? translate('agents.manager.unknown', 'Unknown')}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xl break-all font-mono">
                  {row.session.cwd ?? translate('agents.manager.unknown', 'Unknown')}
                </TooltipContent>
              </Tooltip>
            </td>
            <td className={cell}>
              <Binding binding={row.binding} />
            </td>
            <td className={`${cell} text-xs`}>
              <Timestamp at={row.createdAt} now={now} />
            </td>
            <td className={`${cell} text-xs`}>
              <Timestamp at={row.lastUsedAt} now={now} />
            </td>
            <td className={`${cell} whitespace-nowrap text-right text-xs tabular-nums`}>
              <div>{row.cpu === null ? '—' : formatCpu(row.cpu)}</div>
              <div className="mt-1 text-muted-foreground">
                {row.memory === null ? '—' : formatMemory(row.memory)}
              </div>
            </td>
            <td className={cell}>
              <div className="flex items-center justify-end gap-1">
                {row.tabId ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={disabled}
                        aria-label={translate('agents.manager.reveal', 'Go to terminal')}
                        onClick={() => onNavigate(row)}
                      >
                        <ArrowUpRight />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {translate('agents.manager.reveal', 'Go to terminal')}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={disabled || !row.session.isAlive}
                      aria-label={translate('agents.manager.endTerminal', 'End terminal')}
                      onClick={() => onTerminate(row)}
                    >
                      <Trash2 />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={4}>
                    {translate('agents.manager.endTerminal', 'End terminal')}
                  </TooltipContent>
                </Tooltip>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
