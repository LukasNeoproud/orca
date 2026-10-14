import { useEffect } from 'react'
import {
  claudeModsCellMetrics,
  claudeModsColumnsFitting,
  claudeModsRowsFitting
} from './claude-mods-layout-metrics'
import type {
  ClaudeModsComponent,
  ClaudeModsSurfaceController
} from './claude-mods-surface-controller'

/** The site's size in cells of the chat's monospace advance and line height, as mods measure. */
export function useClaudeModsViewport(
  controller: ClaudeModsSurfaceController | null,
  component: ClaudeModsComponent,
  element: HTMLElement | null,
  isFullscreen?: boolean
): void {
  useEffect(() => {
    if (!controller || !element) {
      return
    }
    const report = (): void => {
      const metrics = claudeModsCellMetrics(element)
      const rect = element.getBoundingClientRect()
      controller.setViewport(component, {
        columns: Math.max(1, claudeModsColumnsFitting(rect.width, metrics)),
        rows: Math.max(1, claudeModsRowsFitting(rect.height, metrics)),
        ...(isFullscreen === undefined ? {} : { isFullscreen })
      })
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    return () => observer.disconnect()
  }, [controller, component, element, isFullscreen])
}
