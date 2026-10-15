// What a `ui_render` ask says about the site it is for: the viewport the person sees, the
// props the terminal would pass the component, and where the last drawing laid out.

import type { ClaudeModsPaneRoster } from '../../../../../shared/claude-mods-surface'
import type { ClaudeModsSiteLayout } from './claude-mods-layout-measure'
import {
  CLAUDE_MODS_BAND_ID,
  type ClaudeModsComponent,
  type ClaudeModsViewport
} from './claude-mods-surface-types'

/** The rows the band may grow to before it scrolls. */
export const CLAUDE_MODS_BAND_MAX_ROWS = 12

/** A mounted site: its layout now, plus the props only its component knows. */
export type ClaudeModsSiteReading = ClaudeModsSiteLayout & {
  placement?: 'dock' | 'inline'
  maxRows?: number
  isWorking?: boolean
}

export type ClaudeModsRenderFields = {
  props: Record<string, unknown>
  viewport?: ClaudeModsViewport
  content_rows?: number
  keyed?: ClaudeModsSiteLayout['keyed']
}

export class ClaudeModsLayoutRegistry {
  private readonly viewports = new Map<ClaudeModsComponent, ClaudeModsViewport>()
  private readonly sites = new Map<string, () => ClaudeModsSiteReading | null>()
  // What the last ask told the engine of each site's layout.
  private readonly told = new Map<string, string>()

  /** True when a viewport already known changed, so mounted sites should be drawn again. */
  setViewport(component: ClaudeModsComponent, viewport: ClaudeModsViewport): boolean {
    const previous = this.viewports.get(component)
    if (
      previous?.columns === viewport.columns &&
      previous.rows === viewport.rows &&
      previous.isFullscreen === viewport.isFullscreen
    ) {
      return false
    }
    this.viewports.set(component, viewport)
    return previous !== undefined
  }

  /** A mounted site reports its layout through `read`; the returned function forgets it. */
  register(instanceId: string, read: () => ClaudeModsSiteReading | null): () => void {
    this.sites.set(instanceId, read)
    return () => {
      if (this.sites.get(instanceId) === read) {
        this.sites.delete(instanceId)
        this.told.delete(instanceId)
      }
    }
  }

  /**
   * True when the site now lays out other than its last ask said. The engine learns `content_rows`
   * and `keyed` only from an ask, and an ask describes the drawing before it, so a drawing that
   * moved them is asked once more; `$.ui.scroll` to `end` or to a key lands only then.
   */
  layoutDrifted(instanceId: string): boolean {
    const reading = this.sites.get(instanceId)?.() ?? null
    return reading !== null && this.told.get(instanceId) !== layoutSignature(reading)
  }

  renderFields(
    component: ClaudeModsComponent,
    instanceId: string,
    roster: ClaudeModsPaneRoster
  ): ClaudeModsRenderFields {
    const viewport = this.viewports.get(component)
    const reading = this.sites.get(instanceId)?.() ?? null
    if (reading) {
      this.told.set(instanceId, layoutSignature(reading))
    }
    const scroll = {
      offset: reading?.offset ?? 0,
      bodyRows: reading?.bodyRows ?? viewport?.rows ?? 0
    }
    const bodyColumns = reading?.bodyColumns ?? viewport?.columns ?? 80
    const props =
      instanceId === CLAUDE_MODS_BAND_ID
        ? {
            hasSurvey: false,
            isWorking: reading?.isWorking ?? false,
            maxRows: reading?.maxRows ?? CLAUDE_MODS_BAND_MAX_ROWS,
            bodyColumns,
            scroll,
            view: {}
          }
        : {
            title: roster.panes.find((pane) => pane.id === instanceId)?.title ?? instanceId,
            isFocused: roster.focused_id === instanceId,
            bodyColumns,
            placement: reading?.placement ?? 'dock',
            scroll,
            view: {}
          }
    return {
      props,
      ...(viewport ? { viewport } : {}),
      // Left out before the first layout, as the wire asks.
      ...(reading ? { content_rows: reading.contentRows, keyed: reading.keyed } : {})
    }
  }
}

function layoutSignature(reading: ClaudeModsSiteReading): string {
  const keyed = reading.keyed.map(
    (entry) => `${entry.plugin}:${entry.key}:${entry.top}:${entry.bottom}`
  )
  return `${reading.bodyRows}|${reading.contentRows}|${keyed.join(',')}`
}
