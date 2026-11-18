import { useCallback, useEffect, useState } from 'react'
import type React from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import {
  GIT_DELETED_BRANCH_LOG_NAME,
  type GitMergedBranch,
  type GitMergedBranchCategory,
  type GitMergedBranchesResult
} from '../../../../../../shared/git-merged-branch-cleanup'
import type { GitBranchCleanupActions } from './use-git-branch-cleanup'

const KEY = 'components.right-sidebar.gitGraph.cleanup'
const CATEGORIES: readonly GitMergedBranchCategory[] = ['merged', 'never-pushed', 'in-workspace']

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; result: GitMergedBranchesResult }

function shortRef(ref: string): string {
  return ref.replace(/^refs\/remotes\//, '')
}

function categoryLabel(category: GitMergedBranchCategory): string {
  if (category === 'merged') {
    return translate(`${KEY}.categoryMerged`, 'Merged and pushed')
  }
  return category === 'never-pushed'
    ? translate(`${KEY}.categoryNeverPushed`, 'Never pushed — may be new branches with no work yet')
    : translate(`${KEY}.categoryInWorkspace`, 'Open in a workspace — remove the workspace instead')
}

function branchStateLabel(branch: GitMergedBranch): string {
  if (branch.category === 'in-workspace') {
    return branch.worktreePath?.split(/[\\/]/).at(-1) ?? ''
  }
  if (branch.remote?.inSync) {
    return translate(`${KEY}.remoteExists`, 'also on {{value0}}', { value0: branch.remote.remote })
  }
  if (branch.remote) {
    return translate(`${KEY}.remoteDiffers`, 'remote branch differs')
  }
  return branch.upstreamGone ? translate(`${KEY}.remoteGone`, 'remote branch deleted') : ''
}

/** Lists the local branches already merged into a long-lived remote branch and deletes the chosen ones. */
export function GitBranchCleanupDialog({
  actions,
  onOpenChange,
  onLoaded,
  onDeleted
}: {
  actions: GitBranchCleanupActions
  onOpenChange: (open: boolean) => void
  /** Hands each listing to the caller, which may show what it learned elsewhere. */
  onLoaded?: (result: GitMergedBranchesResult) => void
  onDeleted: () => void
}): React.JSX.Element {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [target, setTarget] = useState<string | undefined>(undefined)
  // Null until the user changes it: the default is everything merged and pushed.
  const [chosen, setChosen] = useState<ReadonlySet<string> | null>(null)
  const [deleteRemote, setDeleteRemote] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    // Closing the dialog or changing the target abandons a slow listing.
    const controller = new AbortController()
    setState({ status: 'loading' })
    setChosen(null)
    actions.load({ target, signal: controller.signal }).then(
      (result) => {
        if (!controller.signal.aborted) {
          setState({ status: 'ready', result })
          onLoaded?.(result)
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'error',
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
    )
    return () => controller.abort()
  }, [actions, onLoaded, reloads, target])
  const reload = useCallback(() => setReloads((count) => count + 1), [])

  const result = state.status === 'ready' ? state.result : null
  const branches = result?.branches ?? []
  const isSelected = (branch: GitMergedBranch): boolean =>
    branch.category !== 'in-workspace' &&
    (chosen ? chosen.has(branch.name) : branch.category === 'merged')
  const selected = branches.filter(isSelected)
  const remoteCount = selected.filter((branch) => branch.remote?.inSync).length

  const toggle = (branch: GitMergedBranch, checked: boolean): void => {
    const next = new Set(selected.map((entry) => entry.name))
    if (checked) {
      next.add(branch.name)
    } else {
      next.delete(branch.name)
    }
    setChosen(next)
  }

  const submit = async (): Promise<void> => {
    setDeleting(true)
    try {
      const outcome = await actions.deleteBranches(
        selected.map((branch) => ({ name: branch.name, head: branch.head, deleteRemote })),
        result?.targetRef ?? undefined
      )
      if (outcome.deleted.length > 0) {
        toast.success(
          translate(`${KEY}.deleted`, 'Deleted branches: {{value0}}', {
            value0: outcome.deleted.length
          }),
          {
            description: translate(
              `${KEY}.deletedLog`,
              'Their last commits are recorded in .git/{{value0}}.',
              { value0: GIT_DELETED_BRANCH_LOG_NAME }
            )
          }
        )
        onDeleted()
      }
      if (outcome.failures.length > 0) {
        toast.error(
          translate(`${KEY}.failed`, 'Branches that could not be deleted: {{value0}}', {
            value0: outcome.failures.length
          }),
          { description: `${outcome.failures[0]!.name}: ${outcome.failures[0]!.error}` }
        )
        reload()
      } else {
        onOpenChange(false)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent data-testid="git-branch-cleanup-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate(`${KEY}.title`, 'Clean up merged branches')}</DialogTitle>
          <DialogDescription>
            {translate(
              `${KEY}.description`,
              'Local branches whose changes are all in a long-lived branch on the remote. Long-lived branches such as main, develop and release/* are never listed.'
            )}
          </DialogDescription>
        </DialogHeader>

        {result && result.targets.length > 1 && result.targetRef && (
          <label className="flex items-center gap-2 text-sm">
            <span className="shrink-0 text-muted-foreground">
              {translate(`${KEY}.mergedInto`, 'Merged into')}
            </span>
            <Select value={result.targetRef} onValueChange={setTarget} disabled={deleting}>
              <SelectTrigger size="sm" className="min-w-0 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {result.targets.map((ref) => (
                  <SelectItem key={ref} value={ref}>
                    {shortRef(ref)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        {result && result.targets.length === 1 && result.targetRef && (
          <p className="text-sm text-muted-foreground">
            {translate(`${KEY}.mergedIntoOne`, 'Merged into {{value0}}', {
              value0: shortRef(result.targetRef)
            })}
          </p>
        )}
        {result && !result.remoteFresh && (
          <p className="text-xs text-muted-foreground">
            {translate(
              `${KEY}.remoteStale`,
              'The remote could not be reached, so this uses what the last fetch knew.'
            )}
          </p>
        )}

        {state.status === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="size-3.5 animate-spin" />
            {translate(`${KEY}.loading`, 'Fetching and looking for merged branches…')}
          </div>
        )}
        {state.status === 'error' && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <span className="min-w-0 flex-1 break-words">{state.error}</span>
            <Button type="button" variant="outline" size="xs" onClick={reload}>
              {translate('components.right-sidebar.gitGraph.retry', 'Retry')}
            </Button>
          </div>
        )}
        {result && branches.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {result.targetRef
              ? translate(`${KEY}.empty`, 'No merged branches to clean up.')
              : translate(
                  `${KEY}.noRemote`,
                  'This repository has no long-lived remote branch to compare with.'
                )}
          </p>
        )}
        {branches.length > 0 && (
          <div className="scrollbar-sleek flex max-h-80 flex-col gap-3 overflow-y-auto">
            {CATEGORIES.map((category) => {
              const rows = branches.filter((branch) => branch.category === category)
              return rows.length === 0 ? null : (
                <section key={category} className="flex flex-col gap-1">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {categoryLabel(category)}
                  </h3>
                  <ul className="flex flex-col">
                    {rows.map((branch) => (
                      <li key={branch.name}>
                        <label className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-accent">
                          <Checkbox
                            checked={isSelected(branch)}
                            disabled={deleting || category === 'in-workspace'}
                            onCheckedChange={(checked) => toggle(branch, checked === true)}
                          />
                          <span
                            className="min-w-0 flex-1 truncate font-mono text-xs"
                            title={branch.name}
                          >
                            {branch.name}
                          </span>
                          <span
                            className="max-w-40 shrink-0 truncate text-xs text-muted-foreground"
                            title={branch.worktreePath}
                          >
                            {branchStateLabel(branch)}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
        {branches.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={deleteRemote}
              disabled={deleting || remoteCount === 0}
              onCheckedChange={(checked) => setDeleteRemote(checked === true)}
            />
            {translate(`${KEY}.deleteRemote`, 'Also delete them on the remote ({{value0}})', {
              value0: remoteCount
            })}
          </label>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {translate(`${KEY}.cancel`, 'Cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting || selected.length === 0}
            onClick={() => void submit()}
          >
            {translate(`${KEY}.delete`, 'Delete selected ({{value0}})', {
              value0: selected.length
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
