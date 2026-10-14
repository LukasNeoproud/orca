import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ClaudeModsDrawContext, type ClaudeModsDrawScope } from './claude-mods-draw-scope'
import { useClaudeModsController } from './claude-mods-controller-context'
import { ClaudeModsNodeView } from './ClaudeModsElement'
import {
  markClaudeModsPrimaryEngine,
  type ClaudeModsSiteAnswer
} from './claude-mods-transcript-answer'
import { claudeModsPropsEqual } from './claude-mods-transcript-props-equal'
import type { ClaudeModsTranscriptSites } from './claude-mods-transcript-sites'
import { claudeModsTranscriptSites } from './claude-mods-transcript-sites-registry'
import { measureClaudeModsTranscriptViewport } from './claude-mods-transcript-viewport'
import type { ClaudeModsNode } from './claude-mods-tree'
import type { ClaudeModsSurfaceController } from './claude-mods-surface-controller'

/** A site's props change as a row streams or a call ends; asks follow once they settle. */
const ASK_DEBOUNCE_MS = 150

type SiteProps = Record<string, unknown>

const CORE_ONLY: ClaudeModsNode = { kind: 'engine', ref: 0 }
const SLOT_VISIBLE = { display: 'contents' } as const
const SLOT_HIDDEN = { display: 'none' } as const

/** The same object while its contents hold, so a row redrawing for other reasons asks nothing. */
function useStableProps(props: SiteProps): SiteProps {
  const ref = useRef(props)
  if (ref.current !== props && !claudeModsPropsEqual(ref.current, props)) {
    ref.current = props
  }
  return ref.current
}

/**
 * Orca's own drawing of one Claude Code transcript component, which a mod may redraw. Without
 * mods, an unhooked component or a drawing that is only core's own, `children` draw exactly as
 * they would alone. `children` receive the props to draw with: the row's own, or the ones a
 * mod rewrote where the tree holds a rewritten engine node.
 */
export function ClaudeModsSite({
  component,
  instanceId,
  props,
  settled = true,
  validate,
  children
}: {
  component: string
  /** Null: the row has no id the engine could know it by, so it is never asked. */
  instanceId: string | null | undefined
  props: SiteProps
  /** False while the row is still streaming: it is not asked until it settles. */
  settled?: boolean
  /** A tree this refuses draws `children` alone. */
  validate?: (tree: ClaudeModsNode) => boolean
  children: (props: SiteProps) => ReactNode
}): React.JSX.Element {
  const controller = useClaudeModsController()
  const sites = controller && instanceId ? claudeModsTranscriptSites(controller) : null
  const [, setVersion] = useState(0)
  const stable = useStableProps(props)
  const asked = useRef(false)

  useEffect(() => {
    if (!sites || !instanceId) {
      return
    }
    const unwatch = sites.watch(component, instanceId, () => setVersion((version) => version + 1))
    return () => unwatch()
  }, [sites, component, instanceId])

  useEffect(() => {
    if (!sites || !instanceId || !settled) {
      return
    }
    const ask = (): void => {
      asked.current = true
      sites.ask(component, instanceId, stable)
    }
    if (!asked.current) {
      ask()
      return
    }
    const timer = setTimeout(ask, ASK_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [sites, component, instanceId, stable, settled])

  const answer = sites && instanceId && settled ? sites.getAnswer(component, instanceId) : null
  // Once a mod may draw this row, core's drawing keeps one place in the tree for good: a
  // different shape around it would remount it and lose its state (an open line, a half answer).
  const framed = useRef(false)
  if (sites && (answer?.hooked || sites.isHooked(component))) {
    framed.current = true
  }
  if (!framed.current) {
    return <>{children(props)}</>
  }
  return (
    <ClaudeModsSiteFrame
      controller={controller}
      sites={sites}
      component={component}
      instanceId={instanceId ?? null}
      answer={answer?.hooked ? answer : null}
      props={props}
      validate={validate}
      draw={children}
    />
  )
}

/**
 * Core's drawing lives in a portal whose host element never changes, so React keeps its state
 * while the host moves to wherever the tree puts the first engine node (or hides, with none).
 */
function ClaudeModsSiteFrame({
  controller,
  sites,
  component,
  instanceId,
  answer,
  props,
  validate,
  draw
}: {
  controller: ClaudeModsSurfaceController | null
  sites: ClaudeModsTranscriptSites | null
  component: string
  instanceId: string | null
  answer: ClaudeModsSiteAnswer | null
  props: SiteProps
  validate: ((tree: ClaudeModsNode) => boolean) | undefined
  draw: (props: SiteProps) => ReactNode
}): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLElement | null>(null)
  if (!hostRef.current) {
    hostRef.current = document.createElement('div')
    hostRef.current.style.display = 'contents'
  }
  const host = hostRef.current
  // A tree this site refuses draws core's own alone.
  const tree =
    answer && (answer.tree.kind === 'engine' || !validate || validate(answer.tree))
      ? answer.tree
      : CORE_ONLY
  const placed = useMemo(() => markClaudeModsPrimaryEngine(tree), [tree])
  const answerProps = answer?.props ?? props
  const primaryProps = placed.ref === null || placed.ref === 0 ? props : answerProps
  // A transcript drawn only by mods has no other element to read its column from.
  useEffect(() => {
    if (sites && rootRef.current && !sites.hasViewport()) {
      sites.setViewport(measureClaudeModsTranscriptViewport(rootRef.current))
    }
  }, [sites])
  const scope = useMemo<ClaudeModsDrawScope | null>(
    () =>
      controller && sites && instanceId
        ? {
            controller,
            component,
            instanceId,
            focusRequested: false,
            dispatch: sites.dispatch(component, instanceId),
            // Negative refs mark the engine node that holds core's drawing itself.
            renderEngine: (ref) =>
              ref < 0 ? (
                <ClaudeModsEngineSlot host={host} />
              ) : (
                draw(ref === 0 ? props : answerProps)
              ),
            ...(answer?.clientModules ? { clientModules: answer.clientModules } : {}),
            redrawSite: () => sites.redraw(component, instanceId, props)
          }
        : null,
    [controller, sites, component, instanceId, host, draw, props, answer, answerProps]
  )
  return (
    <>
      <ClaudeModsDrawContext.Provider value={scope}>
        <div ref={rootRef} data-claude-mods-site={component} className="min-w-0 max-w-full">
          {scope ? <ClaudeModsNodeView node={placed.tree} /> : null}
          {!scope ? <ClaudeModsEngineSlot host={host} /> : null}
          {scope && placed.ref === null ? <ClaudeModsEngineSlot host={host} hidden /> : null}
        </div>
      </ClaudeModsDrawContext.Provider>
      {createPortal(draw(primaryProps), host)}
    </>
  )
}

/** Where the host of core's drawing sits now; hidden, it still keeps the drawing's elements. */
function ClaudeModsEngineSlot({
  host,
  hidden = false
}: {
  host: HTMLElement
  hidden?: boolean
}): React.JSX.Element {
  const attach = useCallback(
    (slot: HTMLDivElement | null) => {
      slot?.appendChild(host)
    },
    [host]
  )
  return <div ref={attach} style={hidden ? SLOT_HIDDEN : SLOT_VISIBLE} />
}
