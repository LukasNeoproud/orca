import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ClaudeModsPane } from '../../../../../shared/claude-mods-surface'
import { useClaudeModsSurface, type ClaudeModsSurface } from './use-claude-mods-surface'
import { publishClaudeModsController } from './claude-mods-pane-surfaces'
import { ClaudeModsControllerContext } from './claude-mods-controller-context'
import { useClaudeModsSurfaceViewport } from './claude-mods-surface-viewport'
import { handleClaudeModsSiteEscape } from './claude-mods-pane-escape'
import { useClaudeModsPaneFocusRequest } from './claude-mods-pane-focus-request'
import { useClaudeModsPaneWidth } from './use-claude-mods-pane-width'
import { shownClaudeModsPaneId } from './claude-mods-pane-roster'
import { ClaudeModsPaneBody } from './ClaudeModsPaneBody'
import { ClaudeModsPaneTabs, claudeModsPaneTitle } from './ClaudeModsPaneTabs'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import type { ClaudeModsSurfaceController } from './claude-mods-surface-controller'

export { ClaudeModsAbovePromptBand } from './ClaudeModsBand'

/** Below this the pane stacks under the transcript instead of docking beside it. */
const DOCK_MIN_WIDTH_PX = 720

export function ClaudeModsPaneDock({
  session,
  paneKey,
  focusComposer,
  children
}: {
  session: { agent: string; sessionId: string; target: RuntimeClientTarget; isVisible?: boolean }
  paneKey: string
  focusComposer: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const surface = useClaudeModsSurface(session)
  const { controller, snapshot } = surface
  useEffect(() => {
    publishClaudeModsController(paneKey, controller)
    return () => publishClaudeModsController(paneKey, null)
  }, [paneKey, controller])
  const rootRef = useRef<HTMLDivElement>(null)
  // 0 until measured: docked, so the first frame does not stack and then jump aside.
  const [dockWidth, setDockWidth] = useState(0)
  useLayoutEffect(() => {
    const element = rootRef.current
    if (!element) {
      return
    }
    setDockWidth(Math.round(element.getBoundingClientRect().width))
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setDockWidth(Math.round(entry.contentRect.width))
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const docked = dockWidth === 0 || dockWidth >= DOCK_MIN_WIDTH_PX
  const live = snapshot.available ? controller : null
  useClaudeModsSurfaceViewport(rootRef, live, docked)
  const { roster } = snapshot
  const shownId = shownClaudeModsPaneId(roster)
  const shown = roster.panes.find((pane) => pane.id === shownId) ?? null
  // The chat's root holds the transcript, this dock and the composer.
  const chatRoot = useCallback(() => rootRef.current?.parentElement ?? null, [])
  const attentionId = useClaudeModsPaneFocusRequest(live, roster, shownId, chatRoot)
  const width = useClaudeModsPaneWidth(dockWidth, docked)
  const column =
    live && shown ? (
      <ClaudeModsPaneColumn
        controller={live}
        surface={surface}
        shown={shown}
        docked={docked}
        attentionId={attentionId}
        focusComposer={focusComposer}
        chatRoot={chatRoot}
      />
    ) : null
  return (
    <div ref={rootRef} className={cn('flex min-h-0 flex-1', docked ? 'flex-row' : 'flex-col')}>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <ClaudeModsControllerContext.Provider value={live}>
          {children}
        </ClaudeModsControllerContext.Provider>
      </div>
      {column && docked ? (
        <div
          ref={width.containerRef}
          style={{ width: width.width }}
          className="relative flex min-h-0 shrink-0"
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={translate('components.native-chat.claudeMods.resizePane', 'Resize pane')}
            className="group absolute top-0 -left-1.5 z-20 flex h-full w-3 cursor-col-resize justify-center"
            onMouseDown={width.onResizeStart}
          >
            <div
              className={cn(
                'h-full w-px transition-colors group-hover:bg-ring/50',
                width.isResizing && 'bg-ring'
              )}
            />
          </div>
          {column}
        </div>
      ) : (
        column
      )}
    </div>
  )
}

function ClaudeModsPaneColumn({
  controller,
  surface,
  shown,
  docked,
  attentionId,
  focusComposer,
  chatRoot
}: {
  controller: ClaudeModsSurfaceController
  surface: ClaudeModsSurface
  shown: ClaudeModsPane
  docked: boolean
  attentionId: string | null
  focusComposer: () => void
  chatRoot: () => Element | null
}): React.JSX.Element {
  const { roster } = surface.snapshot
  return (
    <aside
      data-claude-mods-pane={shown.id}
      aria-label={claudeModsPaneTitle(shown)}
      className={cn(
        'flex min-h-0 min-w-0 flex-col bg-chat-canvas text-sm text-chat-foreground',
        docked ? 'flex-1 border-l border-border' : 'max-h-[45%] shrink-0 border-t border-border'
      )}
      onFocus={() => {
        if (roster.focused_id !== shown.id) {
          controller.focusPane(shown.id)
        }
      }}
      onBlur={(event) => {
        // The keyboard left the pane (a click in the composer, the transcript): the CLI holds a
        // focused pane over a newly opened one until it hears so. A body unmounting under the
        // focus (a tab switch) is not the person leaving.
        const removed = event.target instanceof Node && !event.target.isConnected
        if (!removed && !event.currentTarget.contains(event.relatedTarget)) {
          controller.focusPane(null)
        }
      }}
      onKeyDown={(event) => {
        handleClaudeModsSiteEscape(
          event,
          focusComposer,
          shown.close_on_escape ? () => controller.closePane(shown.id) : undefined
        )
      }}
    >
      <ClaudeModsPaneTabs
        panes={roster.panes}
        shownId={shown.id}
        attentionId={attentionId}
        onShow={(id) => controller.showPane(id)}
        onClose={(id) => controller.closePane(id)}
      />
      <ClaudeModsPaneBody
        key={shown.id}
        controller={controller}
        surface={surface}
        paneId={shown.id}
        docked={docked}
        chatRoot={chatRoot}
      />
    </aside>
  )
}
