import React, { useMemo, useState } from 'react'
import { ChevronDown, Plus, SquareTerminal } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { createAndOpenFloatingWorkspaceTerminalTab } from '@/lib/floating-workspace-tab-creation'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import {
  openIndependentTerminalsView,
  useIndependentTerminalsViewOpen
} from '@/lib/independent-terminals-view'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import { ProjectHeaderActions } from './ProjectHeaderActions'
import { PROJECT_GROUP_HEADER_BASE_PADDING } from './worktree-list/rows/indentation'

const EMPTY_TABS: TerminalTab[] = []
const EMPTY_ORDER: string[] = []
// Header padding + 16px icon + 6px gap: child content lines up under the title.
const CHILD_CONTENT_INSET = PROJECT_GROUP_HEADER_BASE_PADDING + 16 + 6
const HEADER_ACTION_CLASS_NAME =
  'flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground'

function orderTabs(tabs: TerminalTab[], order: string[]): TerminalTab[] {
  const rank = new Map(order.map((id, index) => [id, index]))
  const rankOf = (id: string): number => rank.get(id) ?? Number.MAX_SAFE_INTEGER
  return [...tabs].sort((a, b) => rankOf(a.id) - rankOf(b.id))
}

/** Independent terminals listed like a project, opening into the workbench like a workspace. */
export function IndependentTerminalsSidebarSection(): React.JSX.Element | null {
  const enabled = useAppStore((s) => s.settings?.floatingTerminalEnabled === true)
  const tabs = useAppStore((s) => s.tabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? EMPTY_TABS)
  const order = useAppStore(
    (s) => s.tabBarOrderByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? EMPTY_ORDER
  )
  const activeTabId = useAppStore(
    (s) =>
      (s.groupsByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? []).find(
        (group) => group.id === s.activeGroupIdByWorktree[FLOATING_TERMINAL_WORKTREE_ID]
      )?.activeTabId ?? null
  )
  const unreadTerminalTabs = useAppStore((s) => s.unreadTerminalTabs)
  const viewOpen = useIndependentTerminalsViewOpen()
  const [collapsed, setCollapsed] = useState(false)
  const orderedTabs = useMemo(() => orderTabs(tabs, order), [tabs, order])
  const hasTabs = orderedTabs.length > 0

  if (!enabled) {
    return null
  }

  const title = translate('sidebar.independentTerminals.title', 'Independent terminals')
  const newTerminalLabel = translate(
    'sidebar.create.independentTerminal',
    'New independent terminal'
  )
  const openTab = (tabId: string): void => {
    useAppStore.getState().activateTab(tabId)
    openIndependentTerminalsView()
    focusTerminalTabSurface(tabId)
  }

  return (
    <div className="shrink-0 pt-1 pr-1 pb-1 pl-1">
      <div
        role="button"
        tabIndex={0}
        aria-label={title}
        aria-current={viewOpen ? 'page' : undefined}
        className={cn(
          'group relative flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md pr-2 text-left transition-colors',
          // Why: with a visible list the selected terminal row carries the highlight instead.
          viewOpen && (!hasTabs || collapsed)
            ? 'bg-worktree-sidebar-accent'
            : 'hover:bg-worktree-sidebar-foreground/5'
        )}
        style={{ paddingLeft: PROJECT_GROUP_HEADER_BASE_PADDING }}
        onClick={openIndependentTerminalsView}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openIndependentTerminalsView()
          }
        }}
      >
        <div className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          <SquareTerminal className="size-3.5" />
        </div>
        <div className="min-w-0 truncate text-[13px] font-semibold leading-none">{title}</div>
        {hasTabs ? (
          <span className="shrink-0 text-[11px] leading-none tabular-nums text-muted-foreground">
            {orderedTabs.length}
          </span>
        ) : null}
        <ProjectHeaderActions>
          {hasTabs ? (
            <button
              type="button"
              className={HEADER_ACTION_CLASS_NAME}
              aria-expanded={!collapsed}
              aria-label={translate('sidebar.independentTerminals.toggle', 'Toggle terminal list')}
              onClick={(event) => {
                event.stopPropagation()
                setCollapsed((value) => !value)
              }}
            >
              <ChevronDown
                className={cn('size-3.5 transition-transform', collapsed && '-rotate-90')}
              />
            </button>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={HEADER_ACTION_CLASS_NAME}
                aria-label={newTerminalLabel}
                onClick={(event) => {
                  event.stopPropagation()
                  void createAndOpenFloatingWorkspaceTerminalTab(useAppStore.getState())
                }}
              >
                <Plus className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={6}>
              {newTerminalLabel}
            </TooltipContent>
          </Tooltip>
        </ProjectHeaderActions>
      </div>
      {hasTabs ? null : (
        // Same copy as the Android host list entry.
        <div
          className="pt-0.5 pb-1 text-[11px] leading-tight text-muted-foreground"
          style={{ paddingLeft: CHILD_CONTENT_INSET }}
        >
          {translate(
            'sidebar.independentTerminals.description',
            'Terminals without a project or workspace'
          )}
        </div>
      )}
      {hasTabs && !collapsed ? (
        <div className="mt-0.5 flex max-h-48 flex-col gap-px overflow-y-auto scrollbar-sleek">
          {orderedTabs.map((tab) => {
            const selected = viewOpen && tab.id === activeTabId
            return (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  'flex h-7 w-full shrink-0 items-center gap-2 rounded-md pr-2 text-left text-[13px] text-worktree-sidebar-foreground/80 transition-colors',
                  selected
                    ? 'bg-worktree-sidebar-accent text-worktree-sidebar-foreground'
                    : 'hover:bg-worktree-sidebar-foreground/5'
                )}
                style={{ paddingLeft: CHILD_CONTENT_INSET }}
                onClick={() => openTab(tab.id)}
              >
                <span className="min-w-0 flex-1 truncate">{tab.customTitle ?? tab.title}</span>
                {unreadTerminalTabs[tab.id] ? (
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
