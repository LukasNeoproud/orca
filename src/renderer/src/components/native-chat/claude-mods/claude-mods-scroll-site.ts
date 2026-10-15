// Everything a mounted pane body or band needs to be a site of the remote surface: its viewport,
// its layout for the engine, its scrolling and its keyboard focus, wired to the DOM it draws in.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { measureClaudeModsSite } from './claude-mods-layout-measure'
import { claudeModsCellMetrics, claudeModsRowAt } from './claude-mods-layout-metrics'
import { ClaudeModsFocusSync } from './claude-mods-focus-sync'
import { ClaudeModsScrollSync } from './claude-mods-scroll-sync'
import { attachClaudeModsScrollInput } from './claude-mods-scroll-input'
import type { ClaudeModsSiteReading } from './claude-mods-layout-registry'
import type {
  ClaudeModsComponent,
  ClaudeModsSurfaceController
} from './claude-mods-surface-controller'

/** Lets a burst of layout changes (a growing log, a resize) settle into one more ask. */
const LAYOUT_TELL_DELAY_MS = 120

export type ClaudeModsSiteInfo = Pick<ClaudeModsSiteReading, 'placement' | 'maxRows' | 'isWorking'>

export type ClaudeModsSite = {
  /** Callback ref for the scroll container: the pane body, or the band's scrolling region. */
  setElement: (element: HTMLElement | null) => void
  element: HTMLElement | null
  /** The site took the keyboard: the first `autoFocus` control takes the ring. */
  takeAutoFocus: () => boolean
}

export function useClaudeModsSite(input: {
  controller: ClaudeModsSurfaceController | null
  component: ClaudeModsComponent
  instanceId: string
  /** Changes whenever a new drawing was committed to the container. */
  drawing: unknown
  info?: ClaudeModsSiteInfo
}): ClaudeModsSite {
  const { controller, component, instanceId, drawing } = input
  const [element, setElement] = useState<HTMLElement | null>(null)
  const layoutRef = useRef<(() => void) | null>(null)
  const focusRef = useRef<ClaudeModsFocusSync | null>(null)
  const infoRef = useRef(input.info)
  infoRef.current = input.info

  useEffect(() => {
    if (!controller || !element) {
      return
    }
    const scroll = new ClaudeModsScrollSync({
      component,
      instanceId,
      request: (fields) => controller.request('ui_scroll', fields),
      read: () => measureClaudeModsSite(element),
      scrollTo: (offset, toEnd) => {
        const metrics = claudeModsCellMetrics(element)
        element.scrollTop = toEnd ? element.scrollHeight : offset * metrics.rowHeight
        return claudeModsRowAt(element.scrollTop, metrics)
      },
      schedule: (run) => {
        const frame = requestAnimationFrame(run)
        return () => cancelAnimationFrame(frame)
      }
    })
    const focus = new ClaudeModsFocusSync(
      { component, instanceId, request: (fields) => controller.request('ui_focus', fields) },
      element
    )
    focusRef.current = focus
    scroll.settled(measureClaudeModsSite(element, false).offset)

    // The DOM must keep the engine's row offset: the browser may not shift it on its own.
    const previousAnchor = element.style.overflowAnchor
    element.style.overflowAnchor = 'none'
    const personInput = attachClaudeModsScrollInput(element)
    let pointer: { column: number; row: number } | undefined
    let lastTop = element.scrollTop
    const onScroll = (): void => {
      const layout = measureClaudeModsSite(element, false)
      lastTop = element.scrollTop
      if (!personInput.isPerson()) {
        scroll.settled(layout.offset)
        return
      }
      scroll.moved(layout.offset, layout.offset >= layout.contentRows - layout.bodyRows, pointer)
      pointer = undefined
    }
    const onWheel = (event: WheelEvent): void => {
      personInput.mark()
      const metrics = claudeModsCellMetrics(element)
      const rect = element.getBoundingClientRect()
      pointer = {
        column: Math.max(0, Math.floor((event.clientX - rect.left) / metrics.cellWidth)),
        row: Math.max(0, Math.floor((event.clientY - rect.top) / metrics.rowHeight))
      }
      const atTop = element.scrollTop <= 0
      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1
      if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
        const rows = Math.max(1, Math.round(Math.abs(event.deltaY) / metrics.rowHeight))
        scroll.pushedAgainstEdge(Math.sign(event.deltaY) * rows, pointer)
        pointer = undefined
      }
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    element.addEventListener('wheel', onWheel, { passive: true })
    const detachFocus = focus.attach()
    const unsubscribe = controller.onPush((event) => {
      if (
        (event.type !== 'scroll' && event.type !== 'focus') ||
        event.push.component !== component ||
        event.push.instance_id !== instanceId
      ) {
        return
      }
      const push = event.push
      if (event.type === 'scroll' && typeof push.offset === 'number') {
        scroll.push(Math.max(0, Math.trunc(push.offset)), push.follow_end === true)
      } else if (
        event.type === 'focus' &&
        typeof push.plugin === 'string' &&
        typeof push.key === 'string'
      ) {
        focus.applyPush({ plugin: push.plugin, key: push.key })
      }
    })
    const unregister = controller.layout.register(instanceId, () => ({
      ...measureClaudeModsSite(element),
      ...infoRef.current
    }))
    // One more ask once a drawing settles into a layout the engine was not told of.
    let tellTimer: ReturnType<typeof setTimeout> | null = null
    const tellLayout = (): void => {
      if (tellTimer === null) {
        tellTimer = setTimeout(() => {
          tellTimer = null
          if (controller.layout.layoutDrifted(instanceId)) {
            controller.redraw(instanceId)
          }
        }, LAYOUT_TELL_DELAY_MS)
      }
    }
    // A resize or a growing child moves the end: stay pinned, or reach an offset now allowed.
    const layout = observeClaudeModsSiteLayout(element, () => {
      // Content that shrank under the window clamps it: the engine clamps its own offset the
      // same way, so that scroll is settled here, never reported as the person's.
      const maxTop = Math.max(0, element.scrollHeight - element.clientHeight)
      if (lastTop > maxTop + 1 && element.scrollTop >= maxTop - 1) {
        scroll.settled(measureClaudeModsSite(element, false).offset)
      }
      lastTop = element.scrollTop
      scroll.afterLayout()
      if (controller.layout.layoutDrifted(instanceId)) {
        tellLayout()
      }
    })
    layoutRef.current = layout.refresh
    layout.refresh()
    return () => {
      layoutRef.current = null
      focusRef.current = null
      scroll.dispose()
      layout.stop()
      if (tellTimer !== null) {
        clearTimeout(tellTimer)
      }
      unregister()
      unsubscribe()
      detachFocus()
      element.removeEventListener('scroll', onScroll)
      element.removeEventListener('wheel', onWheel)
      personInput.detach()
      element.style.overflowAnchor = previousAnchor
    }
  }, [controller, element, component, instanceId])

  useLayoutEffect(() => {
    layoutRef.current?.()
    focusRef.current?.afterLayout()
  }, [drawing])

  const takeAutoFocus = useCallback(() => focusRef.current?.takeAutoFocus() ?? false, [])
  return useMemo(() => ({ setElement, element, takeAutoFocus }), [element, takeAutoFocus])
}

/**
 * Watches the site and its current content root, which a redraw may replace. Outside the hook's
 * effect because react-doctor reads an `observe` in a nested function as a leak; the effect's
 * cleanup calls `stop`.
 */
function observeClaudeModsSiteLayout(
  element: HTMLElement,
  onChange: () => void
): { refresh: () => void; stop: () => void } {
  let observedRoot: Element | null = null
  const resizes = new ResizeObserver(() => refresh())
  const refresh = (): void => {
    const root = element.firstElementChild
    if (root !== observedRoot) {
      if (observedRoot) {
        resizes.unobserve(observedRoot)
      }
      observedRoot = root
      if (root) {
        resizes.observe(root)
      }
    }
    onChange()
  }
  resizes.observe(element)
  return { refresh, stop: () => resizes.disconnect() }
}
