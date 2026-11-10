import { useContext } from 'react'
import { PanelRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { NativeChatSidePanelContext } from './native-chat-side-panel-context'

/** The chat's corner button that opens and closes the panel beside it. */
export function NativeChatSidePanelToggle(): React.JSX.Element | null {
  const panel = useContext(NativeChatSidePanelContext)
  if (!panel) {
    return null
  }
  const label = translate('components.native-chat.sidePanel.toggle', 'Conversation panel')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={panel.tab !== null}
          onClick={() => panel.toggle()}
          className="absolute top-2 right-12 z-10"
        >
          <PanelRight className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
