import React from 'react'
import { Check, History, UserRoundSearch } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type { GitAnnotateMenu } from './use-monaco-git-annotate'

/** Annotate actions of the editor gutter menu; an older host shows them disabled with the reason. */
export function GitAnnotateGutterMenuItems({
  menu,
  line
}: {
  menu: GitAnnotateMenu | null
  /** 1-based line the menu was invoked on. */
  line: number
}): React.JSX.Element | null {
  if (!menu) {
    return null
  }
  const disabled = menu.disabledReason !== null
  const ToggleIcon = menu.annotated ? Check : UserRoundSearch
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        role="menuitemcheckbox"
        aria-checked={menu.annotated}
        disabled={disabled}
        onSelect={menu.toggleAnnotations}
      >
        <ToggleIcon className="w-3.5 h-3.5 mr-1.5" />
        {translate('gitAnnotate.toggle', 'Annotate with Git Blame')}
      </DropdownMenuItem>
      <DropdownMenuItem disabled={disabled} onSelect={() => menu.showLineHistory(line, line)}>
        <History className="w-3.5 h-3.5 mr-1.5" />
        {translate('gitAnnotate.showLineHistory', 'Show History for Line {{value0}}', {
          value0: line
        })}
      </DropdownMenuItem>
      {menu.disabledReason ? <DropdownMenuLabel>{menu.disabledReason}</DropdownMenuLabel> : null}
    </>
  )
}
