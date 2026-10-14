import { useLayoutEffect, useRef } from 'react'
import { claudeModsTranscriptSites } from './claude-mods-transcript-sites-registry'
import type { ClaudeModsSurfaceController } from './claude-mods-surface-controller'
import type { ClaudeModsViewport } from './claude-mods-surface-types'

/** The transcript column in cells of its monospace advance and line height, as mods measure. */
export function measureClaudeModsTranscriptViewport(element: Element): ClaudeModsViewport {
  const root = element.closest('[data-native-chat-scroll]') ?? element
  const fontSize = Number.parseFloat(getComputedStyle(root).fontSize) || 14
  const rect = root.getBoundingClientRect()
  return {
    columns: Math.max(1, Math.floor(rect.width / (fontSize * 0.6))),
    rows: Math.max(1, Math.floor(rect.height / (fontSize * 1.4)))
  }
}

/** Reports the element's transcript column to the chat's transcript sites. */
export function useClaudeModsTranscriptViewport(
  controller: ClaudeModsSurfaceController | null
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  // A layout effect runs before the rows' passive ones, so their first asks carry the column.
  useLayoutEffect(() => {
    const element = ref.current
    if (!controller || !element) {
      return
    }
    const sites = claudeModsTranscriptSites(controller)
    const report = (): void => sites.setViewport(measureClaudeModsTranscriptViewport(element))
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    return () => observer.disconnect()
  }, [controller])
  return ref
}
