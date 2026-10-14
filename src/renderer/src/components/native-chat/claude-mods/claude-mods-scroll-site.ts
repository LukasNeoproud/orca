// Everything a mounted pane body or band needs to be a site of the remote surface: its viewport,
// its layout for the engine, its scrolling and its keyboard focus, wired to the DOM it draws in.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { measureClaudeModsSite } from './claude-mods-layout-measure'
import { claudeModsCellMetrics, claudeModsRowAt } from './claude-mods-layout-metrics'
import { ClaudeModsFocusSync } from './claude-mods-focus-sync'
import { ClaudeModsScrollSync } from './claude-mods-scroll-sync'
import type { ClaudeModsSiteReading } from './claude-mods-layout-registry'
import type {
  ClaudeModsComponent,
  ClaudeModsSurfaceController
} from './claude-mods-surface-controller'
import { useClaudeModsViewport } from './use-claude-mods-viewport'

/** Scrolls this soon after a wheel, key or touch are the person's; later ones are layout's. */
const PERSON_INPUT_WINDOW_MS = 600

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
  isFullscreen?: boolean
  info?: ClaudeModsSiteInfo
}): ClaudeModsSite {
  const { controller, component, instanceId, drawing } = input
  const [element, setElement] = useState<HTMLElement | null>(null)
  const scrollRef = useRef<ClaudeModsScrollSync | null>(null)
  const focusRef = useRef<ClaudeModsFocusSync | null>(null)
  const infoRef = useRef(input.info)
  infoRef.current = input.info
  useClaudeModsViewport(controller, component, element, input.isFullscreen)

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
    scrollRef.current = scroll
    focusRef.current = focus
    scroll.settled(measureClaudeModsSite(element, false).offset)

    let lastInput = Number.NEGATIVE_INFINITY
    let pointerHeld = false
    let pointer: { column: number; row: number } | undefined
    const markInput = (): void => {
      lastInput = performance.now()
    }
    const onScroll = (): void => {
      const layout = measureClaudeModsSite(element, false)
      const person = pointerHeld || performance.now() - lastInput < PERSON_INPUT_WINDOW_MS
      if (!person) {
        scroll.settled(layout.offset)
        return
      }
      scroll.moved(layout.offset, layout.offset >= layout.contentRows - layout.bodyRows, pointer)
      pointer = undefined
    }
    const onWheel = (event: WheelEvent): void => {
      markInput()
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
    const onPointerDown = (): void => {
      pointerHeld = true
      markInput()
    }
    const onPointerUp = (): void => {
      pointerHeld = false
      markInput()
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    element.addEventListener('wheel', onWheel, { passive: true })
    element.addEventListener('keydown', markInput)
    element.addEventListener('touchstart', markInput, { passive: true })
    element.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
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
    // A resize or a growing child moves the end: stay pinned, or reach an offset now allowed.
    const resizes = new ResizeObserver(() => scroll.afterLayout())
    resizes.observe(element)
    if (element.firstElementChild) {
      resizes.observe(element.firstElementChild)
    }
    return () => {
      scrollRef.current = null
      focusRef.current = null
      scroll.dispose()
      resizes.disconnect()
      unregister()
      unsubscribe()
      detachFocus()
      element.removeEventListener('scroll', onScroll)
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('keydown', markInput)
      element.removeEventListener('touchstart', markInput)
      element.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [controller, element, component, instanceId])

  useLayoutEffect(() => {
    scrollRef.current?.afterLayout()
    focusRef.current?.afterLayout()
  }, [drawing])

  const takeAutoFocus = useCallback(() => focusRef.current?.takeAutoFocus() ?? false, [])
  return useMemo(() => ({ setElement, element, takeAutoFocus }), [element, takeAutoFocus])
}
