import { cloneElement, useState, type MouseEventHandler, type ReactElement } from 'react'
import { Maximize2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { AgentTerminalPreview } from '@/components/dashboard-popout/AgentTerminalPreview'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'

type AgentManagerPreviewProps = {
  session: { sessionId: string }
  label: string
  children: ReactElement<{ onClick?: MouseEventHandler<HTMLElement> }>
}

export function AgentManagerPreview({
  session,
  label,
  children
}: AgentManagerPreviewProps): React.JSX.Element {
  const [hoverOpen, setHoverOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const openExpanded = (): void => {
    setHoverOpen(false)
    setExpanded(true)
  }

  const trigger = cloneElement(children, {
    onClick: (event) => {
      children.props.onClick?.(event)
      if (!event.defaultPrevented) {
        openExpanded()
      }
    }
  })

  return (
    <>
      <HoverCard open={hoverOpen} onOpenChange={setHoverOpen} openDelay={250} closeDelay={120}>
        <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
        <HoverCardContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-[min(32rem,calc(100vw-2rem))] overflow-hidden p-0"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-xs font-medium">{label}</p>
            <span className="text-[11px] text-muted-foreground">
              {translate('agents.manager.readOnly', 'Read-only')}
            </span>
            <Button variant="ghost" size="xs" onClick={openExpanded}>
              <Maximize2 />
              {translate('agents.manager.expandPreview', 'Expand')}
            </Button>
          </div>
          {hoverOpen && !expanded ? (
            <AgentTerminalPreview
              ptyId={session.sessionId}
              readOnly
              className="h-64 rounded-b-md p-1"
            />
          ) : null}
        </HoverCardContent>
      </HoverCard>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          aria-describedby={undefined}
          className="flex h-[calc(100vh-3rem)] w-[calc(100vw-3rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        >
          <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12">
            <DialogTitle className="flex items-center gap-2 truncate text-sm">
              <span className="truncate">{label}</span>
              <span className="shrink-0 text-[11px] font-normal text-muted-foreground">
                {translate('agents.manager.readOnly', 'Read-only')}
              </span>
            </DialogTitle>
          </DialogHeader>
          {expanded ? (
            <AgentTerminalPreview
              ptyId={session.sessionId}
              readOnly
              className="min-h-0 flex-1 p-2"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
