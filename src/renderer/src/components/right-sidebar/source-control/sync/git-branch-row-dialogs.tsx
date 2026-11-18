import { useState } from 'react'
import type React from 'react'
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
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { GitBranchEntry } from '../../../../../../shared/git-branch-list'

const KEY = 'components.right-sidebar.gitGraph.branches'

export type GitBranchDeleteChoice = { deleteRemote: boolean }

/** Confirms deleting one branch; says so when nothing shows it was merged. */
export function GitBranchDeleteDialog({
  branch,
  merged,
  remoteInSync,
  busy,
  onConfirm,
  onCancel
}: {
  branch: GitBranchEntry
  /** Known merged from the cleanup's check; false also covers "not checked yet". */
  merged: boolean
  /** The tracked remote branch exists at the same commit, so it can go too. */
  remoteInSync: boolean
  busy: boolean
  onConfirm: (choice: GitBranchDeleteChoice) => void
  onCancel: () => void
}): React.JSX.Element {
  const [deleteRemote, setDeleteRemote] = useState(false)
  const remote = branch.kind === 'remote'
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {remote
              ? translate(`${KEY}.deleteRemoteTitle`, 'Delete branch on the remote?')
              : translate(`${KEY}.deleteTitle`, 'Delete branch?')}
          </DialogTitle>
          <DialogDescription>
            {remote
              ? translate(
                  `${KEY}.deleteRemoteWarning`,
                  'This removes the branch for everyone using the remote.'
                )
              : merged
                ? translate(`${KEY}.deleteMerged`, 'Its changes are already merged.')
                : translate(
                    `${KEY}.deleteUnmerged`,
                    'Nothing shows this branch was merged. Commits only it has will be hard to find again.'
                  )}
          </DialogDescription>
        </DialogHeader>
        <p className="break-all font-mono text-xs text-foreground">{branch.name}</p>
        {!remote && remoteInSync && branch.upstream && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={deleteRemote}
              disabled={busy}
              onCheckedChange={(checked) => setDeleteRemote(checked === true)}
            />
            {translate(`${KEY}.alsoDeleteRemote`, 'Also delete {{value0}}', {
              value0: branch.upstream.name
            })}
          </label>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {translate(`${KEY}.cancel`, 'Cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => onConfirm({ deleteRemote })}
          >
            {translate(`${KEY}.delete`, 'Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function GitBranchRenameDialog({
  branch,
  busy,
  onConfirm,
  onCancel
}: {
  branch: GitBranchEntry
  busy: boolean
  onConfirm: (newName: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [name, setName] = useState(branch.name)
  const trimmed = name.trim()
  const canSubmit = !busy && trimmed.length > 0 && trimmed !== branch.name
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate(`${KEY}.renameTitle`, 'Rename branch')}</DialogTitle>
          <DialogDescription>
            {translate(
              `${KEY}.renameDescription`,
              'Only the local branch is renamed; a branch it tracks on the remote keeps its name.'
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSubmit) {
              onConfirm(trimmed)
            }
          }}
        >
          <Input
            autoFocus
            value={name}
            aria-label={translate(`${KEY}.renameTitle`, 'Rename branch')}
            onChange={(event) => setName(event.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              {translate(`${KEY}.cancel`, 'Cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {translate(`${KEY}.rename`, 'Rename')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
