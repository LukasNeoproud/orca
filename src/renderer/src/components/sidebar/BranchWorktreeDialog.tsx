import { openRegisteredWorktree } from '@/lib/open-registered-worktree'
import { getBranchManagementOwner } from './branch-management-owner'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { translate } from '@/i18n/i18n'
import type { Worktree } from '../../../../shared/worktree/types'
import type {
  BranchManagementAction,
  BranchManagementPreview
} from '../../../../shared/worktree/branch-management'

export function BranchWorktreeDialog({
  worktree,
  onOpenChange
}: {
  worktree: Worktree
  onOpenChange: (open: boolean) => void
}) {
  const [label, setLabel] = useState(worktree.displayName)
  const [branch, setBranch] = useState('')
  const [action, setAction] = useState<BranchManagementAction>('switch')
  const [preview, setPreview] = useState<BranchManagementPreview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const revision = useRef(0)
  const rpc = useCallback(
    <T,>(method: string, extra = {}) => {
      const state = useAppStore.getState()
      const { target } = getBranchManagementOwner(state, worktree)
      return callRuntimeRpc<T>(
        target,
        method,
        { worktree: toRuntimeWorktreeSelector(worktree.id), ...extra },
        { timeoutMs: 30000 }
      )
    },
    [worktree]
  )
  const refresh = useCallback(async () => {
    const request = ++revision.current
    try {
      const result = await rpc<BranchManagementPreview>('git.branchManagementPreview')
      if (request === revision.current) {
        setPreview(result)
        setError('')
      }
    } catch (e) {
      if (request === revision.current) {
        setPreview(null)
        setError(String(e instanceof Error ? e.message : e))
      }
    }
  }, [rpc])
  useEffect(() => {
    void refresh()
    const request = revision.current
    return () => {
      revision.current = request + 1
    }
  }, [refresh])
  const run = async (operation: () => Promise<void>) => {
    if (busyRef.current) {
      return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      await operation()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  const occupied = preview?.worktrees.find(
    (item) => item.branch === branch && item.path !== preview.path && preview.current !== branch
  )
  const saveLabel = () =>
    run(async () => {
      await useAppStore.getState().updateWorktreeMeta(
        worktree.id,
        { displayName: label.trim(), displayNameIsPinned: true },
        {
          executionHostId: getBranchManagementOwner(useAppStore.getState(), worktree)
            .executionHostId
        }
      )
    })
  const submit = () =>
    run(async () => {
      await rpc('git.manageBranch', { action, branch })
      await useAppStore.getState().fetchWorktrees(worktree.repoId, {
        executionHostId: getBranchManagementOwner(useAppStore.getState(), worktree).executionHostId
      })
      await refresh()
      setBranch('')
    })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busy) {
          onOpenChange(open)
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate('branchManagement.title', 'Branch & worktree')}</DialogTitle>
          <DialogDescription className="space-y-1">
            <span className="block font-medium text-foreground">
              {translate('branchManagement.worktreePath', 'Worktree path')}
            </span>
            <span className="block break-all">{preview?.path ?? worktree.path}</span>
          </DialogDescription>
        </DialogHeader>
        <p className="space-y-1 text-sm">
          <span className="block font-medium">
            {preview && !preview.current
              ? translate('branchManagement.currentCommit', 'Current commit')
              : translate('branchManagement.currentBranch', 'Current branch')}
          </span>
          <span className="block break-all text-muted-foreground">
            {preview
              ? (preview.current ??
                `${translate('branchManagement.detached', 'Detached HEAD')} · ${preview.head.slice(0, 12)}`)
              : translate('branchManagement.loading', 'Loading checkout…')}
          </span>
        </p>
        <div className="space-y-2">
          <Label htmlFor="worktree-sidebar-label">
            {translate('branchManagement.sidebarName', 'Sidebar name')}
          </Label>
          <Input
            id="worktree-sidebar-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={busy}
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="link"
              size="sm"
              disabled={!preview?.current || busy}
              onClick={() => setLabel(preview?.current ?? label)}
            >
              {translate('branchManagement.useBranch', 'Use current branch as sidebar name')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!label.trim() || busy}
              onClick={() => void saveLabel()}
            >
              {translate('branchManagement.saveLabel', 'Save label')}
            </Button>
          </div>
        </div>
        <form
          className="space-y-3 border-t pt-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (preview && branch && !occupied && !busy) {
              void submit()
            }
          }}
        >
          <div className="flex flex-wrap gap-2">
            {(['switch', 'create', 'rename'] as const).map((value) => (
              <Button
                type="button"
                key={value}
                size="sm"
                variant={action === value ? 'secondary' : 'ghost'}
                disabled={busy}
                onClick={() => {
                  setAction(value)
                  setBranch('')
                }}
              >
                {value === 'switch'
                  ? translate('branchManagement.switch', 'Switch branch…')
                  : value === 'create'
                    ? translate('branchManagement.create', 'Create branch from current HEAD…')
                    : translate('branchManagement.rename', 'Rename current branch…')}
              </Button>
            ))}
          </div>
          <Label htmlFor="managed-branch">{translate('branchManagement.branch', 'Branch')}</Label>
          <Input
            id="managed-branch"
            autoFocus
            list={action === 'switch' ? 'managed-branches' : undefined}
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            disabled={busy}
            aria-invalid={Boolean(error)}
          />
          <datalist id="managed-branches">
            {preview?.branches.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {preview?.blockers.length ? (
            <div className="space-y-1 text-xs text-muted-foreground">
              <ul>
                {preview.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
              {preview.sessions.map((session, index) => (
                <p key={`${session}-${index}`}>{session}</p>
              ))}
              <Button
                type="button"
                size="sm"
                variant="link"
                onClick={() => {
                  void run(async () => {
                    activateAndRevealWorktree(worktree.id, {
                      executionHostId: getBranchManagementOwner(useAppStore.getState(), worktree)
                        .executionHostId,
                      providesInitialSurface: true
                    })
                    const state = useAppStore.getState()
                    state.setRightSidebarTab('source-control')
                    state.setRightSidebarOpen(true)
                    onOpenChange(false)
                  })
                }}
              >
                {translate('branchManagement.sourceControl', 'Source Control')}
              </Button>
            </div>
          ) : null}
          {occupied ? (
            <div className="space-y-1 text-xs">
              <p className="break-all">{occupied.path}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await openRegisteredWorktree(
                      worktree.repoId,
                      occupied.path,
                      getBranchManagementOwner(useAppStore.getState(), worktree).executionHostId
                    )
                    onOpenChange(false)
                  })
                }
              >
                {translate('branchManagement.open', 'Open worktree')}
              </Button>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void refresh()}>
              {translate('branchManagement.refresh', 'Refresh')}
            </Button>
            <Button
              type="submit"
              disabled={busy || !preview || !branch.trim() || Boolean(occupied)}
            >
              {busy
                ? translate('branchManagement.applying', 'Applying…')
                : translate('branchManagement.apply', 'Apply branch change')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
