import { useCallback, useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { Check, FolderGit2, GitBranchMinus, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { GitBranchEntry } from '../../../../../../shared/git-branch-list'
import type { GitMergedBranchesResult } from '../../../../../../shared/git-merged-branch-cleanup'
import { GitBranchCleanupDialog } from './git-branch-cleanup-dialog'
import { GitBranchDeleteDialog, GitBranchRenameDialog } from './git-branch-row-dialogs'
import type { GitBranchListActions } from './use-git-branch-list'

const KEY = 'components.right-sidebar.gitGraph.branches'

type Pending = { action: 'delete' | 'rename'; branch: GitBranchEntry }

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function BranchRow({
  branch,
  merged,
  onSelect,
  onOpenWorkspace,
  onCreateWorkspace,
  onRequest
}: {
  branch: GitBranchEntry
  merged: boolean
  onSelect: () => void
  onOpenWorkspace: () => void
  onCreateWorkspace: () => void
  onRequest: (action: Pending['action']) => void
}): React.JSX.Element {
  const changeable = !branch.protected && !branch.worktreePath
  const menuLabel = translate(`${KEY}.actions`, 'Branch actions')
  return (
    <li className="group flex items-center gap-1 rounded-md pr-1 hover:bg-accent">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={`${branch.name}\n${branch.subject}`}
        onClick={onSelect}
      >
        {branch.current ? (
          <Check className="size-3 shrink-0 text-foreground" />
        ) : branch.worktreePath ? (
          <FolderGit2 className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <span
          className={cn('min-w-0 flex-1 truncate font-mono', branch.current && 'font-semibold')}
        >
          {branch.name}
        </span>
        {merged && (
          <span className="shrink-0 text-muted-foreground">
            {translate(`${KEY}.merged`, 'merged')}
          </span>
        )}
        {branch.upstream?.gone && (
          <span className="shrink-0 text-muted-foreground">{translate(`${KEY}.gone`, 'gone')}</span>
        )}
        {branch.upstream && branch.upstream.ahead > 0 && (
          <span className="shrink-0 tabular-nums text-muted-foreground">
            ↑{branch.upstream.ahead}
          </span>
        )}
        {branch.upstream && branch.upstream.behind > 0 && (
          <span className="shrink-0 tabular-nums text-muted-foreground">
            ↓{branch.upstream.behind}
          </span>
        )}
      </button>
      <DropdownMenu>
        {/* Why a wrapper: the trigger stays hidden until the row is hovered, focused or its menu is open. */}
        <span className="shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-xs" aria-label={menuLabel}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
        </span>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onSelect}>
            {translate(`${KEY}.showInGraph`, 'Show in graph')}
          </DropdownMenuItem>
          {branch.worktreePath && (
            <DropdownMenuItem onSelect={onOpenWorkspace}>
              {translate(`${KEY}.openWorkspace`, 'Open its workspace')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onCreateWorkspace}>
            {translate(`${KEY}.newWorkspace`, 'New workspace from this branch…')}
          </DropdownMenuItem>
          {changeable && <DropdownMenuSeparator />}
          {changeable && branch.kind === 'local' && (
            <DropdownMenuItem onSelect={() => onRequest('rename')}>
              {translate(`${KEY}.renameItem`, 'Rename…')}
            </DropdownMenuItem>
          )}
          {changeable && (
            <DropdownMenuItem variant="destructive" onSelect={() => onRequest('delete')}>
              {branch.kind === 'remote'
                ? translate(`${KEY}.deleteRemoteItem`, 'Delete on the remote…')
                : translate(`${KEY}.deleteItem`, 'Delete…')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

/** Local and remote branches beside the commit graph, the way a Git client lists them. */
export function GitBranchList({
  actions,
  revision,
  onSelectCommit,
  onChanged
}: {
  actions: GitBranchListActions
  /** Changes whenever the graph reloads, so the list follows it. */
  revision: unknown
  onSelectCommit: (commitId: string) => void
  onChanged: () => void
}): React.JSX.Element {
  const [branches, setBranches] = useState<GitBranchEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [cleanupOpen, setCleanupOpen] = useState(false)
  // Known only after the cleanup has checked; it fetches, so the list does not ask on its own.
  const [mergedNames, setMergedNames] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    let current = true
    actions.list().then(
      (result) => {
        if (current) {
          setBranches(result.branches)
          setError(null)
        }
      },
      (failure: unknown) => {
        if (current) {
          setError(errorText(failure))
        }
      }
    )
    return () => {
      current = false
    }
  }, [actions, revision])

  const rememberMerged = useCallback((result: GitMergedBranchesResult): void => {
    // Only branches that were pushed: one merely sitting on the target's commit has merged nothing.
    setMergedNames(
      new Set(
        result.branches
          .filter((branch) => branch.category === 'merged')
          .map((branch) => branch.name)
      )
    )
  }, [])

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const visible = (branches ?? []).filter((branch) => branch.name.toLowerCase().includes(needle))
    return [
      {
        kind: 'local' as const,
        label: translate(`${KEY}.local`, 'Local'),
        rows: visible.filter((branch) => branch.kind === 'local')
      },
      {
        kind: 'remote' as const,
        label: translate(`${KEY}.remote`, 'Remote'),
        rows: visible.filter((branch) => branch.kind === 'remote')
      }
    ]
  }, [branches, filter])

  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await work()
      setPending(null)
      onChanged()
    } catch (failure) {
      toast.error(errorText(failure))
    } finally {
      setBusy(false)
    }
  }

  const remoteHeadOf = (branch: GitBranchEntry): string | undefined =>
    branches?.find((entry) => entry.kind === 'remote' && entry.name === branch.upstream?.name)?.head
  const cleanupLabel = translate(
    'components.right-sidebar.gitGraph.cleanup.title',
    'Clean up merged branches'
  )

  return (
    <aside
      data-testid="git-branch-list"
      className="flex w-64 shrink-0 flex-col gap-2 rounded-md border border-border p-2"
    >
      <div className="flex items-center gap-1">
        <Input
          value={filter}
          placeholder={translate(`${KEY}.filter`, 'Filter branches')}
          aria-label={translate(`${KEY}.filter`, 'Filter branches')}
          className="h-7 min-w-0 flex-1"
          onChange={(event) => setFilter(event.target.value)}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={cleanupLabel}
              onClick={() => setCleanupOpen(true)}
            >
              <GitBranchMinus />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {cleanupLabel}
          </TooltipContent>
        </Tooltip>
      </div>
      {error && <p className="break-words text-xs text-destructive">{error}</p>}
      <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {groups.map((group) => (
          <section key={group.kind} className="flex flex-col gap-0.5">
            <h3 className="px-1.5 text-xs font-medium text-muted-foreground">
              {group.label} ({group.rows.length})
            </h3>
            <ul className="flex flex-col">
              {group.rows.map((branch) => (
                <BranchRow
                  key={`${branch.kind}:${branch.name}`}
                  branch={branch}
                  merged={branch.kind === 'local' && mergedNames.has(branch.name)}
                  onSelect={() => onSelectCommit(branch.head)}
                  onOpenWorkspace={() => {
                    if (branch.worktreePath && !actions.openWorkspace(branch.worktreePath)) {
                      toast.error(
                        translate(
                          `${KEY}.workspaceUnknown`,
                          'Orca has no workspace at {{value0}}',
                          {
                            value0: branch.worktreePath
                          }
                        )
                      )
                    }
                  }}
                  onCreateWorkspace={() => actions.createWorkspace(branch.name)}
                  onRequest={(action) => setPending({ action, branch })}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {pending?.action === 'delete' && (
        <GitBranchDeleteDialog
          branch={pending.branch}
          merged={mergedNames.has(pending.branch.name)}
          remoteInSync={remoteHeadOf(pending.branch) === pending.branch.head}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={({ deleteRemote }) =>
            void run(async () => {
              const result = await actions.deleteBranch({
                kind: pending.branch.kind,
                name: pending.branch.name,
                head: pending.branch.head,
                deleteRemote
              })
              if (result.remoteError) {
                toast.error(result.remoteError)
              }
            })
          }
        />
      )}
      {pending?.action === 'rename' && (
        <GitBranchRenameDialog
          branch={pending.branch}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={(newName) =>
            void run(() => actions.renameBranch(pending.branch.name, newName))
          }
        />
      )}
      {cleanupOpen && (
        <GitBranchCleanupDialog
          actions={actions.cleanup}
          onOpenChange={setCleanupOpen}
          onLoaded={rememberMerged}
          onDeleted={onChanged}
        />
      )}
    </aside>
  )
}
