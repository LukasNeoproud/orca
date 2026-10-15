import { useEffect, useMemo, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { ClaudeModsDrawContext } from './claude-mods-draw-scope'
import { ClaudeModsNodeView } from './ClaudeModsElement'
import { claudeModsHotkeyTarget } from './claude-mods-focus-keyboard'
import { useClaudeModsSite } from './claude-mods-scroll-site'
import { propString, type ClaudeModsNode } from './claude-mods-tree'
import {
  claudeModsFocusedPane,
  claudeModsFocusRequestAllowed
} from './claude-mods-pane-focus-request'
import type { ClaudeModsSurfaceController } from './claude-mods-surface-controller'
import type { ClaudeModsSurface } from './use-claude-mods-surface'

/** Long enough that a drawing on its way never flashes the placeholder (UX rule 1). */
const PLACEHOLDER_DELAY_MS = 300

const ALWAYS_VISIBLE: ReadonlySet<string> = new Set([
  'Button',
  'Input',
  'Select',
  'Svg',
  'Client',
  'Code',
  'Markdown',
  'Link'
])

/** Whether a tree puts anything on screen, after Claude Desktop's test for its empty pane. */
export function claudeModsDrawsAnything(node: ClaudeModsNode): boolean {
  if (node.kind === 'text') {
    return node.text.trim() !== ''
  }
  if (node.kind !== 'element') {
    return false
  }
  const { props } = node
  return (
    ALWAYS_VISIBLE.has(node.type) ||
    propString(props, 'backgroundColor') !== undefined ||
    Boolean(propString(props, 'borderStyle')) ||
    props.inverse === true ||
    node.children.some(claudeModsDrawsAnything)
  )
}

/** One pane's drawing; keyed by pane id, so a tab switch mounts a fresh site. */
export function ClaudeModsPaneBody({
  controller,
  surface,
  paneId,
  docked,
  chatRoot
}: {
  controller: ClaudeModsSurfaceController
  surface: ClaudeModsSurface
  paneId: string
  docked: boolean
  /** The chat this pane belongs to; focus outside it is never the pane's to take. */
  chatRoot: () => Element | null
}): React.JSX.Element {
  const { roster, drawings } = surface.snapshot
  const pane = roster.panes.find((candidate) => candidate.id === paneId)
  const drawing = drawings[paneId]
  const drawn = drawing !== undefined
  const focusRequested = roster.focus_requested_id === paneId
  const site = useClaudeModsSite({
    controller,
    component: 'Pane',
    instanceId: paneId,
    drawing: drawing?.tree,
    info: { placement: docked ? 'dock' : 'inline' }
  })
  const plugin = pane?.plugin
  // Judged once per request, after the first drawing: a redraw is not a new request.
  useEffect(() => {
    const { element } = site
    if (!focusRequested || !drawn || !element) {
      return
    }
    const active = document.activeElement
    if (!element.contains(active)) {
      if (!claudeModsFocusRequestAllowed({ active, chatRoot: chatRoot(), plugin })) {
        controller.focusPane(claudeModsFocusedPane(active), true)
        return
      }
      if (!site.takeAutoFocus()) {
        element.focus({ preventScroll: true })
      }
    }
    controller.focusPane(paneId)
  }, [focusRequested, drawn, controller, paneId, site, chatRoot, plugin])
  const scope = useMemo(
    () => ({
      controller,
      component: 'Pane',
      instanceId: paneId,
      focusRequested,
      ...(drawing?.clientModules ? { clientModules: drawing.clientModules } : {}),
      redrawSite: () => controller.redraw(paneId)
    }),
    [controller, paneId, focusRequested, drawing?.clientModules]
  )
  const empty = !drawing || !drawing.hooked || !claudeModsDrawsAnything(drawing.tree)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={site.setElement}
        tabIndex={-1}
        className="scrollbar-sleek min-h-0 flex-1 overflow-auto p-3 focus-visible:outline-none"
        onKeyDown={(event) => {
          const hit = drawing ? claudeModsHotkeyTarget(drawing.tree, event) : undefined
          if (hit) {
            event.preventDefault()
            controller.press(paneId, hit.press, hit.key)
          }
        }}
      >
        {drawing ? (
          <ClaudeModsDrawContext.Provider value={scope}>
            <ClaudeModsNodeView node={drawing.tree} />
          </ClaudeModsDrawContext.Provider>
        ) : null}
      </div>
      {empty ? <ClaudeModsPanePlaceholder plugin={plugin ?? paneId} /> : null}
    </div>
  )
}

function ClaudeModsPanePlaceholder({ plugin }: { plugin: string }): React.JSX.Element | null {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), PLACEHOLDER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])
  if (!shown) {
    return null
  }
  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center"
    >
      <p className="max-w-[36ch] text-sm text-chat-foreground">
        {translate('components.native-chat.claudeMods.paneEmptyTitle', 'Nothing to show yet')}
      </p>
      <p className="max-w-[36ch] text-xs text-chat-foreground-faint">
        {translate(
          'components.native-chat.claudeMods.paneEmptyBody',
          '{{plugin}} has not drawn in this pane',
          { plugin }
        )}
      </p>
    </div>
  )
}
