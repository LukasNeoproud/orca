import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, SquareTerminal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../../store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { hasVisibleOverlay } from '@/lib/visible-overlay'
import { navigateResourceSessionToTab } from '../status-bar/resource-session-navigation'
import { AgentManagerTable } from './AgentManagerTable'
import { AgentManagerFilters } from './AgentManagerFilters'
import { AgentManagerConfirmation } from './AgentManagerConfirmation'
import { filterManagerRows, type ManagerFilter, type ManagerRow } from './agent-manager-model'
import { useAgentManager } from './use-agent-manager'

export default function AgentManagerPage() {
  const manager = useAgentManager()
  const close = useAppStore((s) => s.closeAgentManager)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ManagerFilter>('all')
  const [project, setProject] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targets, setTargets] = useState<ManagerRow[] | null>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        targets ||
        manager.busy ||
        hasVisibleOverlay()
      ) {
        return
      }
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.matches('input, textarea, select, [contenteditable="true"]')
      ) {
        target.blur()
      } else {
        close()
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, targets, manager.busy])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const visible = useMemo(
    () => filterManagerRows(manager.rows, query, filter, project),
    [manager.rows, query, filter, project]
  )
  const projects = useMemo(
    () =>
      [
        ...new Map(
          manager.rows.flatMap((r) =>
            r.projectId ? [[r.projectId, r.projectName ?? r.projectId] as const] : []
          )
        ).entries()
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [manager.rows]
  )
  const selectedRows = visible.filter((row) => selected.has(row.key) && row.session.isAlive)
  const disabled = manager.busy || manager.loading || manager.error || manager.incomplete
  const changeFilter = (action: () => void) => {
    setSelected(new Set())
    action()
  }
  const select = (kind: 'all' | 'orphan' | 'independent' | 'none') => {
    setSelected(
      new Set(
        kind === 'none'
          ? []
          : visible
              .filter(
                (row) =>
                  row.session.isAlive &&
                  (kind === 'all' ||
                    (kind === 'orphan' ? row.binding === 'orphan' : row.independent))
              )
              .map((row) => row.key)
      )
    )
  }
  const navigate = (row: ManagerRow) => {
    if (!row.tabId) {
      return
    }
    const state = useAppStore.getState()
    navigateResourceSessionToTab(row.tabId, row.paneKey, {
      tabsByWorktree: state.tabsByWorktree,
      setOpen: () => close(),
      setActiveView: state.setActiveView,
      activateAndRevealWorktree,
      activateTabAndFocusPane
    })
  }
  const confirm = async () => {
    if (!targets) {
      return
    }
    await manager.terminate(targets)
    setTargets(null)
    setSelected(new Set())
  }
  return (
    <section
      className="flex h-full min-h-0 flex-col bg-background text-foreground"
      aria-label={translate('agents.manager.title', 'Agents and terminals')}
    >
      <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-sm font-semibold">
            <SquareTerminal className="size-4 text-muted-foreground" />
            {translate('agents.manager.title', 'Agents and terminals')}
          </h1>
          <p className="text-xs text-muted-foreground">
            {translate(
              'agents.manager.scope',
              'Local terminals managed by Orca, including sessions preserved across restarts. No remote or external terminals.'
            )}
          </p>
          <p className="pt-1 text-xs tabular-nums text-muted-foreground">
            {translate(
              'agents.manager.summary',
              '{{total}} terminals · {{working}} working · {{orphans}} orphan · {{independent}} independent',
              {
                total: manager.rows.length,
                working: manager.rows.filter((r) => r.state === 'working').length,
                orphans: manager.rows.filter((r) => r.binding === 'orphan').length,
                independent: manager.rows.filter((r) => r.independent).length
              }
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={manager.loading || manager.busy}
            onClick={() => void manager.refresh()}
          >
            <RefreshCw className="size-3.5" />
            {translate('agents.manager.refresh', 'Refresh')}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={close}
                disabled={manager.busy}
                aria-label={translate('agents.manager.close', 'Close agents and terminals')}
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {translate('agents.manager.close', 'Close agents and terminals')}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>
      <AgentManagerFilters
        query={query}
        onQuery={(v) => changeFilter(() => setQuery(v))}
        filter={filter}
        onFilter={(v) => changeFilter(() => setFilter(v))}
        project={project}
        onProject={(v) => changeFilter(() => setProject(v))}
        projects={projects}
        disabled={disabled}
        onSelect={select}
      />
      {manager.error || manager.incomplete ? (
        <p role="alert" className="border-b border-border px-6 py-3 text-xs text-destructive">
          {translate(
            'agents.manager.inventoryError',
            'The local inventory could not be fully verified. Last-known terminals may still be running. Refresh before ending sessions.'
          )}
        </p>
      ) : null}
      {manager.degraded ? (
        <p role="status" className="border-b border-border px-6 py-3 text-xs text-muted-foreground">
          {translate(
            'agents.manager.degraded',
            'The terminal daemon is degraded. Non-persistent fallback terminals may be missing from this list.'
          )}
        </p>
      ) : null}
      {manager.results.length > 0 ? (
        <div role="status" className="border-b border-border px-6 py-3 text-xs">
          <p>
            {translate(
              'agents.manager.results',
              '{{exited}} ended · {{live}} still running · {{unknown}} could not be verified',
              {
                exited: manager.results.filter((r) => r.status === 'exited').length,
                live: manager.results.filter((r) => r.status === 'live').length,
                unknown: manager.results.filter((r) => r.status === 'unverifiable').length
              }
            )}
          </p>
          {manager.results.some((r) => r.status !== 'exited') ? (
            <ul className="mt-2 max-h-24 overflow-auto text-muted-foreground scrollbar-sleek">
              {manager.results
                .filter((r) => r.status !== 'exited')
                .map((r) => (
                  <li key={r.key}>
                    {r.label} —{' '}
                    {r.status === 'live'
                      ? translate('agents.manager.stillRunning', 'Still running')
                      : translate('agents.manager.unverifiable', 'Could not verify termination')}
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto scrollbar-sleek" aria-busy={manager.loading}>
        {visible.length ? (
          <AgentManagerTable
            rows={visible}
            selected={selected}
            disabled={disabled}
            now={now}
            onToggle={(row) =>
              setSelected((previous) => {
                const next = new Set(previous)
                if (next.has(row.key)) {
                  next.delete(row.key)
                } else {
                  next.add(row.key)
                }
                return next
              })
            }
            onToggleAll={() =>
              select(
                selectedRows.length === visible.filter((r) => r.session.isAlive).length
                  ? 'none'
                  : 'all'
              )
            }
            onNavigate={navigate}
            onTerminate={(row) => setTargets([row])}
          />
        ) : (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
            <SquareTerminal className="size-7" />
            <p>
              {manager.loading
                ? translate('agents.manager.loading', 'Loading local terminals…')
                : manager.error || manager.incomplete
                  ? translate('agents.manager.unavailable', 'Terminal inventory unavailable')
                  : manager.rows.length
                    ? translate('agents.manager.noMatch', 'No terminals match these filters.')
                    : translate('agents.manager.empty', 'No local Orca terminals are running.')}
            </p>
          </div>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-3">
        <p className="max-w-2xl text-xs text-muted-foreground">
          {translate(
            'agents.manager.footer',
            'Last used records terminal input observed by this window. Unknown does not mean idle. Orphan means no known pane or agent owner; selecting does not end a terminal.'
          )}
        </p>
        {selectedRows.length ? (
          <div className="flex shrink-0 items-center gap-3 text-xs">
            <span>
              {translate('agents.manager.selected', '{{count}} selected', {
                count: selectedRows.length
              })}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={manager.busy}
              onClick={() => select('none')}
            >
              {translate('agents.manager.clearSelection', 'Clear selection')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={disabled}
              onClick={() => setTargets(selectedRows)}
            >
              {translate('agents.manager.endSelected', 'End selected…')}
            </Button>
          </div>
        ) : null}
      </footer>
      <AgentManagerConfirmation
        targets={targets}
        busy={manager.busy}
        completed={manager.results.length}
        onCancel={() => setTargets(null)}
        onConfirm={() => void confirm()}
      />
    </section>
  )
}
