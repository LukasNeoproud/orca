import { findRepoForHost } from '@/store/slices/repo-host-identity'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { openRegisteredWorktree } from '@/lib/open-registered-worktree'
import {
  formatBranchRefLabel,
  isLocalBranchSelection
} from '../../../../shared/composer-branch-selection'
import { SimplifiedBaseBranchField } from './SimplifiedBaseBranchField'
import { SimplifiedBranchField } from './SimplifiedBranchField'
import { NewWorkspaceComposerNameSection } from './NewWorkspaceComposerNameSection'
import type { NewWorkspaceComposerCardProps } from './new-workspace-composer-card-props'
import type { SimplifiedWorktreeForm } from './use-simplified-worktree-form'

function LinkedName({
  label,
  value,
  custom,
  onCustomize,
  onChange,
  onReset
}: {
  label: string
  value: string
  custom: boolean
  onCustomize: () => void
  onChange: (v: string) => void
  onReset: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <Button type="button" size="sm" variant="ghost" onClick={custom ? onReset : onCustomize}>
          {custom
            ? translate('simplifiedWorktree.reset', 'Reset')
            : translate('simplifiedWorktree.customize', 'Customize')}
        </Button>
      </div>
      {custom ? (
        <Input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <p className="break-all text-sm">{value || '—'}</p>
      )}
    </div>
  )
}

export function SimplifiedWorktreeFields({
  form,
  card,
  suggestedBranchName,
  onClose
}: {
  form: SimplifiedWorktreeForm
  card: NewWorkspaceComposerCardProps
  suggestedBranchName?: string
  onClose: () => void
}): React.JSX.Element {
  const [issueText, setIssueText] = useState('')
  const [issueError, setIssueError] = useState<string | null>(null)
  const [customLocation, setCustomLocation] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const setBranch = (value: string) => {
    form.setBranch(value)
    form.setRemote(null)
    card.onNameValueChange(value)
  }
  const location = customLocation
    ? 'custom'
    : form.root === '.worktrees'
      ? 'inside'
      : form.root === ''
        ? 'default'
        : 'custom'
  const occupied = form.preview?.occupyingWorktree
  const openWorktree = async () => {
    try {
      if (!occupied) {
        return
      }
      await openRegisteredWorktree(
        card.repoId,
        occupied.path,
        card.selectedRepoExecutionHostId ?? 'local'
      )
      onClose()
    } catch (err) {
      setOpenError(String(err))
    }
  }
  return (
    <>
      <SimplifiedBranchField
        value={form.branch}
        inputRef={card.nameInputRef}
        branches={form.branches}
        onChange={setBranch}
        onSubmit={card.onCreate}
        onSelect={(row) => {
          if (row) {
            setBranch(row.localBranchName)
            if (
              !isLocalBranchSelection(row.refName, row.localBranchName) &&
              !form.branches.some(
                (b) =>
                  b.localBranchName === row.localBranchName &&
                  isLocalBranchSelection(b.refName, b.localBranchName)
              )
            ) {
              form.setRemote(row)
            }
          }
        }}
      />
      {form.remote ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'simplifiedWorktree.tracking',
            'Create local tracking branch “{{branch}}” from {{ref}}.',
            { branch: form.remote.localBranchName, ref: formatBranchRefLabel(form.remote.refName) }
          )}
        </p>
      ) : null}
      {(!form.preview || form.preview.branch.kind === 'new') && !form.remote ? (
        <SimplifiedBaseBranchField
          repoId={card.repoId}
          hostId={card.selectedRepoExecutionHostId}
          value={form.baseBranch ?? form.preview?.baseBranch ?? ''}
          onChange={form.setBase}
          onSubmit={card.onCreate}
        />
      ) : null}
      <LinkedName
        label={translate('simplifiedWorktree.worktreeName', 'Worktree name')}
        value={form.name}
        custom={form.customName !== null}
        onCustomize={() => form.setCustomName(form.name)}
        onChange={form.setCustomName}
        onReset={() => form.setCustomName(null)}
      />
      <LinkedName
        label={translate('simplifiedWorktree.sidebarName', 'Sidebar name')}
        value={form.displayName}
        custom={form.customLabel !== null}
        onCustomize={() => form.setCustomLabel(form.displayName)}
        onChange={form.setCustomLabel}
        onReset={() => form.setCustomLabel(null)}
      />
      <div className="space-y-2">
        <Label>{translate('simplifiedWorktree.location', 'Location')}</Label>
        <Select
          value={location}
          onValueChange={(v) => {
            setCustomLocation(v === 'custom')
            if (v !== 'custom') {
              form.setRoot(v === 'inside' ? '.worktrees' : '')
            }
            setSaved(false)
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inside">
              {translate('simplifiedWorktree.inside', 'Inside main repository (.worktrees/)')}
            </SelectItem>
            <SelectItem value="default">
              {translate('simplifiedWorktree.orcaDefault', 'Orca default location')}
            </SelectItem>
            <SelectItem value="custom">
              {translate('simplifiedWorktree.custom', 'Custom…')}
            </SelectItem>
          </SelectContent>
        </Select>
        {location === 'custom' ? (
          <Input
            aria-label={translate('simplifiedWorktree.customLocation', 'Custom location')}
            value={form.root}
            onChange={(e) => {
              form.setRoot(e.target.value)
              setSaved(false)
            }}
          />
        ) : null}
        <Select
          value={form.layout}
          onValueChange={(v) => {
            form.setLayout(v as 'nested' | 'flat')
            setSaved(false)
          }}
        >
          <SelectTrigger aria-label={translate('simplifiedWorktree.layout', 'Directory layout')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nested">
              {translate('simplifiedWorktree.nested', 'Nested')}
            </SelectItem>
            <SelectItem value="flat">{translate('simplifiedWorktree.flat', 'Flat')}</SelectItem>
          </SelectContent>
        </Select>
        {form.preview ? (
          <p className="break-all font-mono text-xs text-muted-foreground">{form.preview.path}</p>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!form.preview || form.pending || (location === 'custom' && !form.root)}
          onClick={() => {
            void useAppStore
              .getState()
              .updateRepo(
                card.repoId,
                {
                  worktreeBasePath: form.root,
                  simplifiedWorktreeLayout: form.layout,
                  simplifiedWorktreeLocation: location === 'default' ? 'orca-default' : location
                },
                { hostId: card.selectedRepoExecutionHostId ?? undefined }
              )
              .then((ok) => {
                const state = useAppStore.getState()
                const repo = findRepoForHost(state.repos, card.repoId, {
                  hostId: card.selectedRepoExecutionHostId,
                  settings: state.settings
                })
                const accepted =
                  ok !== false &&
                  repo?.simplifiedWorktreeLayout === form.layout &&
                  repo.simplifiedWorktreeLocation ===
                    (location === 'default' ? 'orca-default' : location) &&
                  (repo.worktreeBasePath ?? '') === form.root.trim()
                setSaved(accepted)
                if (!accepted) {
                  setSaveError(
                    translate('simplifiedWorktree.saveFailed', 'Could not save project default.')
                  )
                }
              })
              .catch((err: unknown) => setSaveError(String(err)))
          }}
        >
          {saved
            ? translate('simplifiedWorktree.saved', 'Saved')
            : translate('simplifiedWorktree.saveDefault', 'Save as project default')}
        </Button>
        {saveError ? (
          <p role="alert" className="text-xs text-destructive">
            {saveError}
          </p>
        ) : null}
      </div>
      {form.preview?.needsLocalIgnore ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {translate(
              'simplifiedWorktree.ignoreDescription',
              'This destination is inside the repository and is not ignored.'
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={form.pending}
            onClick={() => void form.ignoreLocally()}
          >
            {translate('simplifiedWorktree.ignoreLocally', 'Ignore locally')}
          </Button>
        </div>
      ) : null}
      {openError ? (
        <p role="alert" className="text-xs text-destructive">
          {openError}
        </p>
      ) : null}
      {occupied ? (
        <div className="space-y-2">
          <p className="break-all text-xs text-muted-foreground">
            {translate('simplifiedWorktree.occupied', 'Already checked out at {{path}}', {
              path: occupied.path
            })}
          </p>
          <Button type="button" variant="outline" onClick={() => void openWorktree()}>
            {translate('simplifiedWorktree.open', 'Open worktree')}
          </Button>
        </div>
      ) : null}
      {form.error || form.preview?.destinationExists ? (
        <p role="alert" className="text-xs text-destructive">
          {form.error ??
            translate(
              'simplifiedWorktree.destinationExists',
              'The destination already exists. Choose another location or name.'
            )}
        </p>
      ) : null}
      <details>
        <summary className="cursor-pointer text-sm">
          {translate('simplifiedWorktree.linkIssue', 'Link issue')}
        </summary>
        <div className="space-y-2 pt-3">
          <NewWorkspaceComposerNameSection
            {...card}
            issueOnly
            name={issueText}
            onLookupError={setIssueError}
            onNameValueChange={(v) => {
              setIssueText(v)
              setIssueError(null)
            }}
            branchesEnabled={false}
            nameInputRef={undefined}
            onNamePlainEnter={() => {}}
          />
          {issueError ? (
            <p role="alert" className="text-xs text-destructive">
              {issueError}
            </p>
          ) : null}
          {suggestedBranchName && suggestedBranchName !== form.branch ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setBranch(suggestedBranchName)}
            >
              {translate('simplifiedWorktree.useSuggested', 'Use suggested branch name')}
            </Button>
          ) : null}
        </div>
      </details>
    </>
  )
}
