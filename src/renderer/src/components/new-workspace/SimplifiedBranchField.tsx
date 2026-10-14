import { isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import { useState, type RefObject } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { translate } from '@/i18n/i18n'
import {
  formatBranchRefLabel,
  isLocalBranchSelection
} from '../../../../shared/composer-branch-selection'
import type { BaseRefSearchResult } from '../../../../shared/repo-types'

export function SimplifiedBranchField({
  value,
  onChange,
  branches,
  onSelect,
  inputRef,
  onSubmit,
  mode = 'branch'
}: {
  value: string
  onChange: (value: string) => void
  branches: BaseRefSearchResult[]
  onSelect: (branch: BaseRefSearchResult | null) => void
  inputRef?: RefObject<HTMLInputElement | null>
  onSubmit: () => void
  mode?: 'branch' | 'base'
}): React.JSX.Element {
  const isBase = mode === 'base'
  const inputId = isBase ? 'simplified-worktree-base' : 'simplified-worktree-branch'
  const optionsId = isBase ? 'simplified-base' : 'simplified-branch'
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const local = branches.filter((b) => isLocalBranchSelection(b.refName, b.localBranchName))
  const remote = branches.filter((b) => !isLocalBranchSelection(b.refName, b.localBranchName))
  const canCreate = !isBase && value.trim() && !local.some((b) => b.localBranchName === value)
  const rows: (BaseRefSearchResult | null)[] = [...(canCreate ? [null] : []), ...local, ...remote]
  const pick = (row: BaseRefSearchResult | null) => {
    onSelect(row)
    setOpen(false)
    setActive(-1)
  }
  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>
        {isBase
          ? translate('simplifiedWorktree.createFrom', 'Create from')
          : translate('simplifiedWorktree.branch', 'Branch')}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <Input
            id={inputId}
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${optionsId}-options`}
            aria-autocomplete="list"
            aria-activedescendant={
              open && active >= 0 ? `${optionsId}-option-${active}` : undefined
            }
            value={value}
            placeholder={
              isBase
                ? translate(
                    'simplifiedWorktree.defaultBase',
                    'Project default, master, or repository default'
                  )
                : translate('simplifiedWorktree.branchPlaceholder', 'feature/123-add-something')
            }
            data-workspace-name-input={isBase ? undefined : 'true'}
            onFocus={() => {
              if (isBase) {
                setOpen(true)
              }
            }}
            onChange={(e) => {
              onChange(e.target.value)
              setOpen(true)
              setActive(-1)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                setOpen(true)
                setActive((i) =>
                  Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))
                )
              }
              if (e.key === 'Escape' && open) {
                e.preventDefault()
                e.stopPropagation()
                setOpen(false)
              }
              if (e.key === 'Enter' && !isScreenSubmitShortcut(e) && !e.nativeEvent.isComposing) {
                e.preventDefault()
                e.stopPropagation()
                if (open && active >= 0 && active < rows.length) {
                  pick(rows[active])
                } else {
                  setOpen(false)
                  onSubmit()
                }
              }
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Command
            shouldFilter={false}
            value={active >= 0 ? (rows[active]?.refName ?? '__create__') : ''}
          >
            <CommandList id={`${optionsId}-options`}>
              {canCreate ? (
                <CommandGroup>
                  <CommandItem
                    className="jump-palette-item"
                    value="__create__"
                    id={`${optionsId}-option-0`}
                    onSelect={() => pick(null)}
                  >
                    {translate('simplifiedWorktree.createBranch', 'Create branch “{{branch}}”', {
                      branch: value
                    })}
                  </CommandItem>
                </CommandGroup>
              ) : null}
              {local.length ? (
                <CommandGroup
                  heading={translate('simplifiedWorktree.localBranches', 'Local branches')}
                >
                  {local.map((b) => (
                    <CommandItem
                      className="jump-palette-item"
                      value={b.refName}
                      id={`${optionsId}-option-${rows.indexOf(b)}`}
                      key={b.refName}
                      onSelect={() => pick(b)}
                    >
                      {b.localBranchName}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {remote.length ? (
                <CommandGroup
                  heading={translate('simplifiedWorktree.remoteBranches', 'Remote branches')}
                >
                  {remote.map((b) => (
                    <CommandItem
                      className="jump-palette-item"
                      value={b.refName}
                      id={`${optionsId}-option-${rows.indexOf(b)}`}
                      key={b.refName}
                      onSelect={() => pick(b)}
                    >
                      {formatBranchRefLabel(b.refName)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
