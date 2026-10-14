import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ClaudeModsDrawContext, type ClaudeModsDrawScope } from './claude-mods-draw-scope'
import { useClaudeModsController } from './claude-mods-controller-context'
import { ClaudeModsNodeView } from './ClaudeModsElement'
import type { ClaudeModsSiteAnswer } from './claude-mods-transcript-answer'
import {
  claudeModsTranscriptSites,
  type ClaudeModsTranscriptSites
} from './claude-mods-transcript-sites'
import { measureClaudeModsTranscriptViewport } from './claude-mods-transcript-viewport'
import type { ClaudeModsNode } from './claude-mods-tree'
import type { ClaudeModsSurfaceController } from './claude-mods-surface-controller'

/** A site's props change as a row streams or a call ends; asks follow once they settle. */
const ASK_DEBOUNCE_MS = 150

type SiteProps = Record<string, unknown>

function propsEqual(a: SiteProps, b: SiteProps): boolean {
  const keys = Object.keys(a)
  if (keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]))) {
    return true
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/** The same object while its contents hold, so a row redrawing for other reasons asks nothing. */
function useStableProps(props: SiteProps): SiteProps {
  const ref = useRef(props)
  if (ref.current !== props && !propsEqual(ref.current, props)) {
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
  if (!controller || !sites || !instanceId || !answer?.hooked) {
    return <>{children(props)}</>
  }
  const { tree } = answer
  if (tree.kind === 'engine') {
    return <>{children(tree.ref === 0 ? props : answer.props)}</>
  }
  if (validate && !validate(tree)) {
    return <>{children(props)}</>
  }
  return (
    <ClaudeModsDrawnSite
      controller={controller}
      sites={sites}
      component={component}
      instanceId={instanceId}
      tree={tree}
      answer={answer}
      props={props}
      draw={children}
    />
  )
}

function ClaudeModsDrawnSite({
  controller,
  sites,
  component,
  instanceId,
  tree,
  answer,
  props,
  draw
}: {
  controller: ClaudeModsSurfaceController
  sites: ClaudeModsTranscriptSites
  component: string
  instanceId: string
  tree: ClaudeModsNode
  answer: ClaudeModsSiteAnswer
  props: SiteProps
  draw: (props: SiteProps) => ReactNode
}): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  // A transcript drawn only by mods has no other element to read its column from.
  useEffect(() => {
    if (rootRef.current) {
      sites.setViewport(measureClaudeModsTranscriptViewport(rootRef.current))
    }
  }, [sites])
  const scope = useMemo<ClaudeModsDrawScope>(
    () => ({
      controller,
      component,
      instanceId,
      focusRequested: false,
      dispatch: sites.dispatch(component, instanceId),
      renderEngine: (ref) => draw(ref === 0 ? props : answer.props),
      ...(answer.clientModules ? { clientModules: answer.clientModules } : {}),
      redrawSite: () => sites.ask(component, instanceId, props)
    }),
    [controller, sites, component, instanceId, draw, props, answer]
  )
  return (
    <ClaudeModsDrawContext.Provider value={scope}>
      <div ref={rootRef} data-claude-mods-site={component} className="min-w-0 max-w-full">
        <ClaudeModsNodeView node={tree} />
      </div>
    </ClaudeModsDrawContext.Provider>
  )
}
