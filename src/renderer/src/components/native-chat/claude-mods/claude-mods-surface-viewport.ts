import { useLayoutEffect } from 'react'
import {
  claudeModsCellMetrics,
  claudeModsColumnsFitting,
  claudeModsRowsFitting
} from './claude-mods-layout-metrics'
import { claudeModsTranscriptSites } from './claude-mods-transcript-sites-registry'
import type { ClaudeModsSurfaceController } from './claude-mods-surface-controller'
import type { ClaudeModsViewport } from './claude-mods-surface-types'

/** The chat's whole drawing area in cells, as a terminal reports its own size. */
export function measureClaudeModsSurfaceViewport(
  element: Element,
  isFullscreen: boolean
): ClaudeModsViewport {
  const metrics = claudeModsCellMetrics(element)
  const rect = element.getBoundingClientRect()
  return {
    columns: Math.max(1, claudeModsColumnsFitting(rect.width, metrics)),
    rows: Math.max(1, claudeModsRowsFitting(rect.height, metrics)),
    isFullscreen
  }
}

/**
 * Reports the chat's drawing area as every site's viewport. The engine reads the latest viewport
 * as the surface's size: one site's own box (a one-row band, a narrow pane) would make it hold a
 * pane back for want of room, so each site's own size rides in its props instead
 * (`bodyColumns`, `scroll.bodyRows`). `isFullscreen` says whether panes dock beside the transcript.
 */
export function useClaudeModsSurfaceViewport(
  ref: React.RefObject<HTMLElement | null>,
  controller: ClaudeModsSurfaceController | null,
  isFullscreen: boolean
): void {
  // A layout effect runs before the rows' passive ones, so their first asks carry the size.
  useLayoutEffect(() => {
    const element = ref.current
    if (!controller || !element) {
      return
    }
    const sites = claudeModsTranscriptSites(controller)
    const report = (): void => {
      const viewport = measureClaudeModsSurfaceViewport(element, isFullscreen)
      controller.setViewport('Pane', viewport)
      controller.setViewport('AbovePrompt', viewport)
      sites.setViewport(viewport)
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, controller, isFullscreen])
}
