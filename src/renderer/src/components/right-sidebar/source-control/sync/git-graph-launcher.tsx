import { useState } from 'react'
import type React from 'react'
import { GitGraph } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { GitGraphDialog, type GitGraphDialogProps } from './git-graph-dialog'

/** The Commits header button that opens the graph of every branch and tag. */
export function GitGraphLauncher(
  props: Omit<GitGraphDialogProps, 'open' | 'onOpenChange'>
): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const label = translate('components.right-sidebar.gitGraph.open', 'Open graph of all branches')
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="my-auto"
            aria-label={label}
            onClick={() => setOpen(true)}
          >
            <GitGraph />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
      {/* Mounted only while open so a closed window holds no history. */}
      {open && <GitGraphDialog {...props} open onOpenChange={setOpen} />}
    </>
  )
}
