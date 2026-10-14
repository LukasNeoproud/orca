import { useEffect, useRef } from 'react'
import type {
  ClaudeModsComponent,
  ClaudeModsSurfaceController
} from './claude-mods-surface-controller'

/** The site's size in cells of the chat's monospace advance and line height, as mods measure. */
export function useClaudeModsViewport(
  controller: ClaudeModsSurfaceController | null,
  component: ClaudeModsComponent,
  isFullscreen?: boolean
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!controller || !element) {
      return
    }
    const report = (): void => {
      const fontSize = Number.parseFloat(getComputedStyle(element).fontSize) || 14
      const rect = element.getBoundingClientRect()
      controller.setViewport(component, {
        columns: Math.max(1, Math.floor(rect.width / (fontSize * 0.6))),
        rows: Math.max(1, Math.floor(rect.height / (fontSize * 1.4))),
        ...(isFullscreen === undefined ? {} : { isFullscreen })
      })
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    return () => observer.disconnect()
  }, [controller, component, isFullscreen])
  return ref
}
