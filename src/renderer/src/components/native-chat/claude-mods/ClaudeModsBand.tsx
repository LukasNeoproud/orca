import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '../../ui/button'
import { ClaudeModsDrawContext } from './claude-mods-draw-scope'
import { ClaudeModsNodeView } from './ClaudeModsElement'
import { useClaudeModsSite } from './claude-mods-scroll-site'
import { claudeModsHotkeyTarget } from './claude-mods-focus-keyboard'
import { isClaudeModsFocusWithinSite } from './claude-mods-focus-sync'
import { CLAUDE_MODS_BAND_MAX_ROWS } from './claude-mods-layout-registry'
import { useClaudeModsPaneController } from './claude-mods-pane-surfaces'
import {
  CLAUDE_MODS_BAND_ID,
  type ClaudeModsSurfaceController
} from './claude-mods-surface-controller'

/** The band above the composer: the mods' log lines, their drawing, and their status lines. */
export function ClaudeModsAbovePromptBand({
  paneKey,
  isWorking = false
}: {
  paneKey: string
  /** Whether the agent is mid-turn; the band's mods read it as `props.isWorking`. */
  isWorking?: boolean
}): React.JSX.Element | null {
  const controller = useClaudeModsPaneController(paneKey)
  const available = useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    () => controller?.getSnapshot().available ?? false
  )
  return controller && available ? (
    <ClaudeModsBandBody controller={controller} isWorking={isWorking} />
  ) : null
}

const noopSubscribe = (): (() => void) => () => {}

function ClaudeModsBandBody({
  controller,
  isWorking
}: {
  controller: ClaudeModsSurfaceController
  isWorking: boolean
}): React.JSX.Element {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const band = snapshot.drawings[CLAUDE_MODS_BAND_ID]
  const drawsBand = band !== undefined && band.hooked && band.tree.kind !== 'engine'
  const site = useClaudeModsSite({
    controller,
    component: 'AbovePrompt',
    instanceId: CLAUDE_MODS_BAND_ID,
    drawing: band?.tree,
    info: { maxRows: CLAUDE_MODS_BAND_MAX_ROWS, isWorking }
  })
  // A turn starting or ending changes the band's props; only a mod that draws the band needs them.
  const bandHooked = band?.hooked === true
  const lastWorking = useRef(isWorking)
  useEffect(() => {
    if (lastWorking.current !== isWorking) {
      lastWorking.current = isWorking
      if (bandHooked) {
        controller.redraw(CLAUDE_MODS_BAND_ID)
      }
    }
  }, [isWorking, bandHooked, controller])
  const scope = useMemo(
    () => ({
      controller,
      component: 'AbovePrompt',
      instanceId: CLAUDE_MODS_BAND_ID,
      focusRequested: false,
      ...(band?.clientModules ? { clientModules: band.clientModules } : {}),
      redrawSite: () => controller.redraw(CLAUDE_MODS_BAND_ID)
    }),
    [controller, band?.clientModules]
  )
  const statuses = Object.entries(snapshot.statuses)
  return (
    <div data-claude-mods-band className="mx-auto w-full max-w-(--chat-content-max-width) px-4">
      {snapshot.logs.length > 0 ? (
        <div className="relative flex flex-col py-1 pr-6 text-xs text-chat-foreground-faint">
          {snapshot.logs.slice(-5).map((line) => (
            <div key={line.id} className="truncate">
              <span className="font-medium">{line.plugin}</span> {line.text}
            </div>
          ))}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="absolute top-0.5 right-0"
            aria-label={translate('components.native-chat.claudeMods.clearLog', 'Clear mod log')}
            onClick={() => controller.clearLogs()}
          >
            <X className="size-3" />
          </Button>
        </div>
      ) : null}
      {drawsBand ? (
        <div
          ref={site.setElement}
          tabIndex={-1}
          data-claude-mods-band-body
          className="scrollbar-sleek my-1 overflow-y-auto text-sm text-chat-foreground focus-visible:outline-none"
          style={{ maxHeight: `calc(${CLAUDE_MODS_BAND_MAX_ROWS} * 1.4em)` }}
          onFocus={(event) => {
            // A click on the band itself takes the keyboard: the first autoFocus takes the ring.
            // A click on empty space while the keyboard is already inside leaves the ring alone.
            if (
              event.target === event.currentTarget &&
              !isClaudeModsFocusWithinSite(event.currentTarget, event.relatedTarget)
            ) {
              site.takeAutoFocus()
            }
          }}
          onKeyDown={(event) => {
            const hit = claudeModsHotkeyTarget(band.tree, event)
            if (hit) {
              event.preventDefault()
              controller.press(CLAUDE_MODS_BAND_ID, hit.press, hit.key)
            }
          }}
        >
          <ClaudeModsDrawContext.Provider value={scope}>
            <ClaudeModsNodeView node={band.tree} />
          </ClaudeModsDrawContext.Provider>
        </div>
      ) : null}
      {statuses.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 pb-1 text-xs text-chat-foreground-faint">
          {statuses.map(([plugin, text]) => (
            <span key={plugin} className="truncate" title={plugin}>
              {text}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
