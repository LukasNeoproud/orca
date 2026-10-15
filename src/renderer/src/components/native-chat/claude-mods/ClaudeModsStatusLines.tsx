import { translate } from '@/i18n/i18n'
import { Button } from '../../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip'

/** Lines shown beside each other before the rest move into the "+N" popover. */
const INLINE_LINES = 2

function StatusLine({ plugin, text }: { plugin: string; text: string }): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex max-w-[32ch] min-w-0 items-baseline gap-1 text-xs text-chat-foreground-faint">
          <span className="shrink-0 text-2xs">{plugin}</span>
          <span className="truncate">{text}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{`${plugin}: ${text}`}</TooltipContent>
    </Tooltip>
  )
}

/** The mods' status lines: each plugin's one line, the overflow behind a "+N" popover. */
export function ClaudeModsStatusLines({
  statuses
}: {
  statuses: Record<string, string>
}): React.JSX.Element | null {
  const entries = Object.entries(statuses)
  if (entries.length === 0) {
    return null
  }
  const shown = entries.slice(0, INLINE_LINES)
  const rest = entries.slice(INLINE_LINES)
  const title = translate('components.native-chat.claudeMods.statusLines', 'Plugin status lines')
  return (
    <div className="mx-auto flex w-full max-w-(--chat-content-max-width) flex-wrap items-center gap-x-4 px-4 pb-1">
      {shown.map(([plugin, text]) => (
        <StatusLine key={plugin} plugin={plugin} text={text} />
      ))}
      {rest.length > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="xs" aria-label={title}>
              {`+${rest.length}`}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto max-w-80">
            <div className="flex flex-col gap-1">
              <p className="text-2xs text-muted-foreground">{title}</p>
              {rest.map(([plugin, text]) => (
                <p key={plugin} className="flex items-baseline gap-1 text-xs">
                  <span className="shrink-0 text-2xs text-muted-foreground">{plugin}</span>
                  <span className="min-w-0 break-words">{text}</span>
                </p>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}
