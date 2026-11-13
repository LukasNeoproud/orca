import type React from 'react'
import { PanelTop } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { GitGraphView, type GitGraphViewProps } from './git-graph-view'

export type GitGraphDialogProps = Omit<
  GitGraphViewProps,
  'onLeave' | 'renderHeading' | 'headerClassName' | 'headerActions'
> & {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Moves the graph into a workspace tab, where it has the whole pane. */
  onOpenInTab?: () => void
}

/** The commit graph as a quick window over the workspace. */
export function GitGraphDialog({
  open,
  onOpenChange,
  onOpenInTab,
  ...view
}: GitGraphDialogProps): React.JSX.Element {
  const openInTabLabel = translate('components.right-sidebar.gitGraph.openInTab', 'Open in a tab')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="git-graph-dialog"
        className="flex h-[90vh] max-w-[94vw] flex-col sm:max-w-7xl"
      >
        <GitGraphView
          {...view}
          onLeave={() => onOpenChange(false)}
          headerClassName="pr-8"
          renderHeading={(title, description) => (
            <>
              <DialogTitle>{title}</DialogTitle>
              <div className="min-w-0 flex-1">
                <DialogDescription>{description}</DialogDescription>
              </div>
            </>
          )}
          headerActions={
            onOpenInTab ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={openInTabLabel}
                    onClick={() => {
                      onOpenInTab()
                      onOpenChange(false)
                    }}
                  >
                    <PanelTop />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={4}>
                  {openInTabLabel}
                </TooltipContent>
              </Tooltip>
            ) : undefined
          }
        />
      </DialogContent>
    </Dialog>
  )
}
