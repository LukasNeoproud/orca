import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { Button } from '../../ui/button'
import { ClaudeModsDrawContext } from './claude-mods-draw-scope'
import { ClaudeModsNodeView } from './ClaudeModsElement'
import { collectClaudeModsHotkeys } from './claude-mods-tree'
import { useClaudeModsSurface, type ClaudeModsSurface } from './use-claude-mods-surface'
import { useClaudeModsViewport } from './use-claude-mods-viewport'
import { publishClaudeModsController } from './claude-mods-pane-surfaces'
import { ClaudeModsControllerContext } from './claude-mods-controller-context'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import type { ClaudeModsSurfaceController } from './claude-mods-surface-controller'

export { ClaudeModsAbovePromptBand } from './ClaudeModsBand'

/** Below this the pane stacks under the transcript instead of docking beside it. */
const DOCK_MIN_WIDTH_PX = 720

function isTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

export function ClaudeModsPaneDock({
  session,
  paneKey,
  focusComposer,
  children
}: {
  session: { agent: string; sessionId: string; target: RuntimeClientTarget }
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
  const [docked, setDocked] = useState(true)
  useEffect(() => {
    const element = rootRef.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(([entry]) =>
      setDocked((entry?.contentRect.width ?? DOCK_MIN_WIDTH_PX) >= DOCK_MIN_WIDTH_PX)
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const { roster } = snapshot
  const shown = roster.panes.find((pane) => pane.id === roster.shown_id) ?? null
  return (
    <div ref={rootRef} className={cn('flex min-h-0 flex-1', docked ? 'flex-row' : 'flex-col')}>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <ClaudeModsControllerContext.Provider value={snapshot.available ? controller : null}>
          {children}
        </ClaudeModsControllerContext.Provider>
      </div>
      {controller && snapshot.available && shown ? (
        <ClaudeModsPane
          key={shown.id}
          controller={controller}
          surface={surface}
          paneId={shown.id}
          docked={docked}
          focusComposer={focusComposer}
        />
      ) : null}
    </div>
  )
}

function ClaudeModsPane({
  controller,
  surface,
  paneId,
  docked,
  focusComposer
}: {
  controller: ClaudeModsSurfaceController
  surface: ClaudeModsSurface
  paneId: string
  docked: boolean
  focusComposer: () => void
}): React.JSX.Element {
  const { roster, drawings } = surface.snapshot
  const pane = roster.panes.find((candidate) => candidate.id === paneId)
  const drawing = drawings[paneId]
  const focusRequested = roster.focus_requested_id === paneId
  const bodyRef = useClaudeModsViewport(controller, 'Pane', docked)
  const asideRef = useRef<HTMLElement>(null)
  // A pane asking for the keyboard gets it only while the person is not typing elsewhere.
  useEffect(() => {
    if (!focusRequested || !drawing) {
      return
    }
    const active = document.activeElement
    const typing =
      (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) &&
      active.value.length > 0 &&
      !asideRef.current?.contains(active)
    if (typing) {
      controller.focusPane(null)
      return
    }
    if (!asideRef.current?.contains(document.activeElement)) {
      const target = asideRef.current?.querySelector<HTMLElement>('[autofocus]') ?? bodyRef.current
      target?.focus()
    }
    controller.focusPane(paneId)
  }, [focusRequested, drawing, controller, paneId, bodyRef])
  const scope = useMemo(
    () => ({ controller, component: 'Pane', instanceId: paneId, focusRequested }),
    [controller, paneId, focusRequested]
  )
  const close = (): void => controller.closePane(paneId)
  return (
    <aside
      ref={asideRef}
      data-claude-mods-pane={paneId}
      aria-label={pane?.title ?? paneId}
      className={cn(
        'flex min-h-0 shrink-0 flex-col bg-chat-canvas text-sm text-chat-foreground',
        docked ? 'w-88 border-l border-border' : 'max-h-[45%] border-t border-border'
      )}
      onFocus={() => {
        if (roster.focused_id !== paneId) {
          controller.focusPane(paneId)
        }
      }}
      onBlur={(event) => {
        // The keyboard left the pane (a click in the composer, the transcript): the CLI holds a
        // focused pane over a newly opened one until it hears so.
        if (!event.currentTarget.contains(event.relatedTarget)) {
          controller.focusPane(null)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          controller.focusPane(null)
          if (pane?.close_on_escape) {
            close()
          }
          focusComposer()
          return
        }
        if (event.metaKey || event.ctrlKey || event.altKey || isTextField(event.target)) {
          return
        }
        const hit = drawing ? collectClaudeModsHotkeys(drawing.tree).get(event.key) : undefined
        if (hit) {
          event.preventDefault()
          controller.press(paneId, hit.press, hit.key)
        }
      }}
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {roster.panes.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={candidate.id === paneId}
              title={candidate.plugin}
              className="truncate rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              onClick={() => controller.showPane(candidate.id)}
            >
              {candidate.title ?? candidate.id}
            </button>
          ))}
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={translate('components.native-chat.claudeMods.closePane', 'Close pane')}
          onClick={close}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div
        ref={bodyRef}
        tabIndex={-1}
        className="scrollbar-sleek min-h-0 flex-1 overflow-auto p-3 focus-visible:outline-none"
      >
        {drawing ? (
          <ClaudeModsDrawContext.Provider value={scope}>
            <ClaudeModsNodeView node={drawing.tree} />
          </ClaudeModsDrawContext.Provider>
        ) : null}
      </div>
    </aside>
  )
}
