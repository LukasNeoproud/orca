import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { translate } from '@/i18n/i18n'
import { propNumber, propString, type ClaudeModsNode } from '../claude-mods-tree'
import {
  ClaudeModsDrawContext,
  useClaudeModsDrawScope,
  type ClaudeModsDrawScope
} from '../claude-mods-draw-scope'
import { ClaudeModsNodeView } from '../ClaudeModsElement'
import type { ClaudeModsSurfaceController } from '../claude-mods-surface-controller'
import { claudeModsClientFramesFor } from './claude-mods-client-frames'
import {
  ClaudeModsClientDriver,
  type ClaudeModsClientSpec,
  type ClaudeModsClientView
} from './claude-mods-client-driver'
import {
  claudeModsClientCell,
  claudeModsClientKey,
  releasesClaudeModsClientFocus,
  type ClaudeModsClientCell
} from './claude-mods-client-events'
import { useClaudeModsClientPointer } from './use-claude-mods-client-pointer'

type ElementNode = Extract<ClaudeModsNode, { kind: 'element' }>

const LOADING: ClaudeModsClientView = { kind: 'loading' }
const CELL_SLACK = 0.05
const noSubscribe = (): (() => void) => () => {}
const loadingView = (): ClaudeModsClientView => LOADING

type Redrawable = { redraw: (instanceId: string) => void }

function canRedraw(controller: object): controller is Redrawable {
  return 'redraw' in controller && typeof controller.redraw === 'function'
}

/** A count is cells of the chat's monospace advance (or line height); a string is a percentage. */
function side(value: unknown, emPerCell: number): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return `${value * emPerCell}em`
  }
  return typeof value === 'string' && /^\d+(\.\d+)?%$/.test(value) ? value : undefined
}

function regionStyle(
  props: Record<string, unknown>
): React.CSSProperties & Record<`--${string}`, string> {
  const width = side(props.width, 0.6)
  const height = side(props.height, 1.4)
  const flexGrow = propNumber(props, 'flexGrow')
  // An absent side is as large as what the module draws.
  return {
    // Inside a Client a row of spacing is a whole line, not the half a site's Boxes use.
    '--claude-mods-row-unit': '1lh',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
    maxWidth: '100%',
    width: width ?? 'max-content',
    ...(height ? { height } : {}),
    ...(flexGrow === undefined ? {} : { flexGrow })
  }
}

function useClaudeModsClientDriver(
  controller: ClaudeModsSurfaceController,
  redraw: (() => void) | undefined
): ClaudeModsClientDriver | null {
  const [driver, setDriver] = useState<ClaudeModsClientDriver | null>(null)
  const redrawRef = useRef(redraw)
  redrawRef.current = redraw
  useEffect(() => {
    const next = new ClaudeModsClientDriver(
      claudeModsClientFramesFor(controller),
      (subtype, fields) => controller.request(subtype, fields),
      (instanceId) => {
        if (redrawRef.current) {
          redrawRef.current()
        } else if (canRedraw(controller)) {
          controller.redraw(instanceId)
        }
      }
    )
    setDriver(next)
    return () => {
      next.dispose()
      setDriver(null)
    }
  }, [controller])
  return driver
}

/**
 * A mod's `Client`: a region whose drawing comes from the plugin's own surface module, run in a
 * sandboxed worker. `clientModules` is the site drawing's `client_modules` (plugin → hash),
 * undefined when the drawing does not carry it; `redraw` asks the site again when a press finds
 * its drawing stale (absent: the controller's own `redraw`, where it has one).
 */
export function ClaudeModsClientRegion({
  node,
  clientModules,
  redraw
}: {
  node: ElementNode
  clientModules?: Readonly<Record<string, string>>
  redraw?: () => void
}): React.JSX.Element | null {
  const scope = useClaudeModsDrawScope()
  const plugin = node.plugin
  const module = propString(node.props, 'module')
  if (!scope || !plugin || !module) {
    return <ClaudeModsClientUnsupported />
  }
  return (
    <ClaudeModsClientMounted
      scope={scope}
      node={node}
      plugin={plugin}
      module={module}
      clientModules={clientModules}
      redraw={redraw}
    />
  )
}

function ClaudeModsClientUnsupported(): React.JSX.Element {
  return (
    <span className="text-xs text-chat-foreground-faint">
      {translate(
        'components.native-chat.claudeMods.clientUnsupported',
        'This part of the mod runs its own code, which Orca does not draw here.'
      )}
    </span>
  )
}

function ClaudeModsClientMounted({
  scope,
  node,
  plugin,
  module,
  clientModules,
  redraw
}: {
  scope: ClaudeModsDrawScope
  node: ElementNode
  plugin: string
  module: string
  clientModules: Readonly<Record<string, string>> | undefined
  redraw: (() => void) | undefined
}): React.JSX.Element {
  const driver = useClaudeModsClientDriver(scope.controller, redraw)
  const view = useSyncExternalStore(
    driver?.subscribe ?? noSubscribe,
    driver?.getView ?? loadingView
  )
  const regionRef = useRef<HTMLDivElement>(null)
  const cellRef = useRef<ClaudeModsClientCell>(claudeModsClientCell(14))
  const [focused, setFocused] = useState(false)
  const client = propString(node.props, 'key') ?? module
  const spec = useMemo<ClaudeModsClientSpec>(
    () => ({
      address: {
        plugin,
        component: scope.component,
        instance_id: scope.instanceId,
        client,
        module
      },
      hash: clientModules?.[plugin],
      loaded: clientModules === undefined || Object.hasOwn(clientModules, plugin),
      props: node.props.props ?? null
    }),
    [plugin, scope.component, scope.instanceId, client, module, clientModules, node.props.props]
  )
  useEffect(() => {
    driver?.update(spec)
  }, [driver, spec])
  const auto =
    side(node.props.width, 0.6) === undefined || side(node.props.height, 1.4) === undefined
  useEffect(() => {
    const element = regionRef.current
    if (!driver || !element) {
      return
    }
    const measure = (): void => {
      const cell = claudeModsClientCell(Number.parseFloat(getComputedStyle(element).fontSize))
      cellRef.current = cell
      const rect = element.getBoundingClientRect()
      // Layout rounds to fractions of a pixel: a box of exactly n cells may measure a hair under.
      driver.resize({
        columns: Math.max(0, Math.floor(rect.width / cell.width + CELL_SLACK)),
        rows: Math.max(0, Math.floor(rect.height / cell.height + CELL_SLACK)),
        auto
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [driver, auto])
  const listeners = view.kind === 'drawn' ? view.listeners : { key: false, pointer: false }
  const pointer = useClaudeModsClientPointer({
    regionRef,
    cellRef,
    enabled: listeners.pointer,
    send: (event) => driver?.pointer(event) ?? false
  })
  // The keyboard is the module's only after a click gives it the focus, and while it listens.
  useEffect(() => {
    if (focused && !listeners.key) {
      regionRef.current?.blur()
      setFocused(false)
    }
  }, [focused, listeners.key])
  const inner = useMemo<ClaudeModsDrawScope | null>(
    () => (driver ? { ...scope, focusRequested: false, dispatch: driver.dispatch } : null),
    [scope, driver]
  )
  return (
    <div
      ref={regionRef}
      data-claude-mods-client={client}
      data-focused={focused ? 'true' : undefined}
      tabIndex={-1}
      style={regionStyle(node.props)}
      className="rounded-sm outline-none data-[focused=true]:ring-2 data-[focused=true]:ring-ring"
      onPointerDown={(event) => {
        pointer.onPointerDown(event)
        if (listeners.key) {
          regionRef.current?.focus()
          setFocused(true)
        }
      }}
      onPointerMove={pointer.onPointerMove}
      onPointerUp={pointer.onPointerUp}
      onPointerCancel={pointer.onPointerCancel}
      onLostPointerCapture={pointer.onLostPointerCapture}
      onPointerEnter={pointer.onPointerEnter}
      onPointerLeave={pointer.onPointerLeave}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false)
        }
      }}
      onKeyDown={(event) => {
        // A field inside the drawing types for itself; the module hears the region's own keys.
        if (!focused || event.target !== event.currentTarget) {
          return
        }
        if (releasesClaudeModsClientFocus(event)) {
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.blur()
          setFocused(false)
          return
        }
        const key = claudeModsClientKey(event)
        if (key && driver?.key(key)) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      {view.kind === 'drawn' && inner ? (
        <ClaudeModsDrawContext.Provider value={inner}>
          <ClaudeModsNodeView node={view.tree} />
        </ClaudeModsDrawContext.Provider>
      ) : view.kind === 'fault' ? (
        <span className="block truncate text-xs text-chat-foreground-faint" title={view.line}>
          {view.line}
        </span>
      ) : view.kind === 'unsupported' ? (
        <ClaudeModsClientUnsupported />
      ) : null}
    </div>
  )
}
