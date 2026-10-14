import { X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { ClaudeModsPane } from '../../../../../shared/claude-mods-surface'
import { Button } from '../../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip'

export const claudeModsPaneTitle = (pane: ClaudeModsPane): string => pane.title || pane.id

function CloseButton({
  label,
  onClose,
  inTabs = false
}: {
  label: string
  onClose: () => void
  inTabs?: boolean
}): React.JSX.Element {
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label={label}
      tabIndex={inTabs ? -1 : undefined}
      onClick={onClose}
    >
      <X className="size-3.5" />
    </Button>
  )
}

/**
 * The pane column's header, after Claude Desktop: one pane shows its title and an X; several are
 * tabs, each closing on its own. A tab the engine asked to show but could not is marked, so a
 * pane waiting on the person is never out of sight.
 */
export function ClaudeModsPaneTabs({
  panes,
  shownId,
  attentionId,
  onShow,
  onClose
}: {
  panes: ClaudeModsPane[]
  shownId: string
  attentionId: string | null
  onShow: (id: string) => void
  onClose: (id: string) => void
}): React.JSX.Element {
  const [only] = panes
  if (panes.length === 1 && only) {
    return (
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border pr-2 pl-3">
        <span className="min-w-0 flex-1 truncate text-xs text-chat-foreground-faint">
          {claudeModsPaneTitle(only)}
        </span>
        <CloseButton
          label={translate('components.native-chat.claudeMods.closePane', 'Close pane')}
          onClose={() => onClose(only.id)}
        />
      </div>
    )
  }
  const focusTab = (from: HTMLElement, step: number | 'first' | 'last'): void => {
    const tabs = [
      ...(from.closest('[role="tablist"]')?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])
    ]
    const at = tabs.indexOf(from)
    const next =
      step === 'first'
        ? tabs[0]
        : step === 'last'
          ? tabs.at(-1)
          : tabs[(at + step + tabs.length) % tabs.length]
    next?.focus()
  }
  return (
    <div className="flex h-8 shrink-0 items-center border-b border-border px-1">
      <div
        role="tablist"
        aria-label={translate('components.native-chat.claudeMods.paneTabs', 'Mod panes')}
        className="scrollbar-none flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
      >
        {panes.map((pane) => {
          const selected = pane.id === shownId
          const title = claudeModsPaneTitle(pane)
          return (
            <div
              key={pane.id}
              data-selected={selected}
              className="group/tab flex max-w-48 min-w-0 shrink-0 items-center rounded-md hover:bg-accent data-[selected=true]:bg-accent"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 pr-0.5 pl-2 text-xs text-chat-foreground-faint group-hover/tab:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-selected:text-accent-foreground"
                    onClick={() => onShow(pane.id)}
                    onAuxClick={(event) => {
                      if (event.button === 1) {
                        event.preventDefault()
                        onClose(pane.id)
                      }
                    }}
                    onKeyDown={(event) => {
                      const step =
                        event.key === 'ArrowRight'
                          ? 1
                          : event.key === 'ArrowLeft'
                            ? -1
                            : event.key === 'Home'
                              ? 'first'
                              : event.key === 'End'
                                ? 'last'
                                : null
                      if (step !== null) {
                        event.preventDefault()
                        focusTab(event.currentTarget, step)
                      } else if (
                        (event.key === 'Delete' || event.key === 'Backspace') &&
                        !event.repeat
                      ) {
                        event.preventDefault()
                        onClose(pane.id)
                      }
                    }}
                  >
                    {pane.id === attentionId && !selected ? (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-chat-warning"
                        aria-label={translate(
                          'components.native-chat.claudeMods.paneWaiting',
                          'Waiting for you'
                        )}
                        role="img"
                      />
                    ) : null}
                    <span className="truncate">{title}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" sideOffset={4}>
                  {pane.plugin ? `${title} · ${pane.plugin}` : title}
                </TooltipContent>
              </Tooltip>
              {/* Revealed on hover and on the selected tab; Delete closes it from the keyboard. */}
              <span className="flex opacity-0 group-hover/tab:opacity-100 group-data-[selected=true]/tab:opacity-100 focus-within:opacity-100">
                <CloseButton
                  label={translate(
                    'components.native-chat.claudeMods.closeNamedPane',
                    'Close {{title}}',
                    { title }
                  )}
                  onClose={() => onClose(pane.id)}
                  inTabs
                />
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
