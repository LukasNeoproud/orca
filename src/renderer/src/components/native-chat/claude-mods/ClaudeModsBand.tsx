import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../ui/button'
import { ClaudeModsDrawContext } from './claude-mods-draw-scope'
import { ClaudeModsNodeView } from './ClaudeModsElement'
import { ClaudeModsStatusLines } from './ClaudeModsStatusLines'
import { useClaudeModsSite } from './claude-mods-scroll-site'
import { shapeClaudeModsBand } from './claude-mods-band-shape'
import { handleClaudeModsSiteEscape } from './claude-mods-pane-escape'
import { claudeModsHotkeyTarget } from './claude-mods-focus-keyboard'
import { isClaudeModsFocusWithinSite } from './claude-mods-focus-sync'
import { CLAUDE_MODS_BAND_MAX_ROWS } from './claude-mods-layout-registry'
import { useClaudeModsPaneController } from './claude-mods-pane-surfaces'
import {
  CLAUDE_MODS_BAND_ID,
  type ClaudeModsSurfaceController
} from './claude-mods-surface-controller'
import { propString } from './claude-mods-tree'
import { useClaudeModsBandFits } from './use-claude-mods-band-fits'

/** The band above the composer: the mods' drawing, docked to it, and their status lines. */
export function ClaudeModsAbovePromptBand({
  paneKey,
  isWorking = false,
  focusComposer
}: {
  paneKey: string
  /** Whether the agent is mid-turn; the band's mods read it as `props.isWorking`. */
  isWorking?: boolean
  /** Where Escape in the band sends the keyboard; without it Escape is left alone. */
  focusComposer?: () => void
}): React.JSX.Element | null {
  const controller = useClaudeModsPaneController(paneKey)
  const available = useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    () => controller?.getSnapshot().available ?? false
  )
  return controller && available ? (
    <ClaudeModsBandBody
      controller={controller}
      isWorking={isWorking}
      focusComposer={focusComposer}
    />
  ) : null
}

const noopSubscribe = (): (() => void) => () => {}

function ClaudeModsBandBody({
  controller,
  isWorking,
  focusComposer
}: {
  controller: ClaudeModsSurfaceController
  isWorking: boolean
  focusComposer: (() => void) | undefined
}): React.JSX.Element | null {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const band = snapshot.drawings[CLAUDE_MODS_BAND_ID]
  const shaped = useMemo(
    () =>
      band !== undefined && band.hooked && band.tree.kind !== 'engine'
        ? shapeClaudeModsBand(band.tree)
        : null,
    [band]
  )
  const drawn = band && shaped?.visible ? { band, shaped } : null
  const site = useClaudeModsSite({
    controller,
    component: 'AbovePrompt',
    instanceId: CLAUDE_MODS_BAND_ID,
    drawing: band?.tree,
    info: { maxRows: CLAUDE_MODS_BAND_MAX_ROWS, isWorking }
  })
  const [content, setContent] = useState<HTMLElement | null>(null)
  useClaudeModsBandFits(site.element, content)
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
  const hasStatuses = Object.keys(snapshot.statuses).length > 0
  if (!drawn && !hasStatuses) {
    return null
  }
  return (
    <div data-claude-mods-band className="[[data-native-chat-thread-goal]+&]:mt-2">
      <ClaudeModsStatusLines statuses={snapshot.statuses} />
      {drawn ? (
        // Pulled over the composer's top padding so the band sits on the input box.
        <div className="-mb-2 shrink-0 px-3 sm:px-4">
          <div
            className="mx-auto flex w-full max-w-(--chat-content-max-width) items-start gap-1 rounded-t-md border border-b-0 border-border bg-muted/30 py-1 pr-1 pl-3 text-muted-foreground"
            onKeyDown={(event) => {
              if (focusComposer && handleClaudeModsSiteEscape(event, focusComposer)) {
                return
              }
              const hit = event.repeat ? undefined : claudeModsHotkeyTarget(drawn.band.tree, event)
              if (hit) {
                event.preventDefault()
                controller.press(CLAUDE_MODS_BAND_ID, hit.press, hit.key)
              }
            }}
          >
            <div
              ref={site.setElement}
              tabIndex={-1}
              data-claude-mods-band-body
              className="scrollbar-sleek min-w-0 flex-1 overflow-y-auto text-sm focus-visible:outline-none data-[fits=true]:overflow-visible"
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
            >
              <div ref={setContent}>
                <ClaudeModsDrawContext.Provider value={scope}>
                  <ClaudeModsNodeView node={drawn.shaped.tree} />
                </ClaudeModsDrawContext.Provider>
              </div>
            </div>
            {drawn.shaped.dismiss.map((node) => {
              const label = propString(node.props, 'label') ?? ''
              const press = node.press
              return (
                <Button
                  key={propString(node.props, 'key') ?? `dismiss:${label}`}
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={label}
                  disabled={!press}
                  onClick={() => {
                    if (press) {
                      controller.press(CLAUDE_MODS_BAND_ID, press, propString(node.props, 'key'))
                    }
                  }}
                >
                  <X className="size-3.5" />
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
