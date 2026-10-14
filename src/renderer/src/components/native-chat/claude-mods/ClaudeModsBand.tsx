import { useMemo, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '../../ui/button'
import { ClaudeModsDrawContext } from './claude-mods-draw-scope'
import { ClaudeModsNodeView } from './ClaudeModsElement'
import { useClaudeModsViewport } from './use-claude-mods-viewport'
import { useClaudeModsPaneController } from './claude-mods-pane-surfaces'
import {
  CLAUDE_MODS_BAND_ID,
  type ClaudeModsSurfaceController
} from './claude-mods-surface-controller'

/** The band above the composer: the mods' log lines, their drawing, and their status lines. */
export function ClaudeModsAbovePromptBand({
  paneKey
}: {
  paneKey: string
}): React.JSX.Element | null {
  const controller = useClaudeModsPaneController(paneKey)
  return controller ? <ClaudeModsBandBody controller={controller} /> : null
}

function ClaudeModsBandBody({
  controller
}: {
  controller: ClaudeModsSurfaceController
}): React.JSX.Element | null {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const band = snapshot.drawings[CLAUDE_MODS_BAND_ID]
  const drawsBand = band !== undefined && band.hooked && band.tree.kind !== 'engine'
  const ref = useClaudeModsViewport(controller, 'AbovePrompt')
  const scope = useMemo(
    () => ({ controller, instanceId: CLAUDE_MODS_BAND_ID, focusRequested: false }),
    [controller]
  )
  const statuses = Object.entries(snapshot.statuses)
  if (!snapshot.available) {
    return null
  }
  return (
    <div
      ref={ref}
      data-claude-mods-band
      className="mx-auto w-full max-w-(--chat-content-max-width) px-4"
    >
      {snapshot.logs.length > 0 ? (
        <div className="relative flex flex-col py-1 pr-6 text-xs text-chat-foreground-faint">
          {snapshot.logs.slice(-5).map((line) => (
            <div key={line.id} className="truncate">
              <span className="font-medium">{line.plugin}</span> {line.text}
            </div>
          ))}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="absolute top-0.5 right-0"
            aria-label={translate('components.native-chat.claudeMods.clearLog', 'Clear mod log')}
            onClick={() => controller.clearLogs()}
          >
            <X className="size-3" />
          </Button>
        </div>
      ) : null}
      {drawsBand ? (
        <div className="py-1 text-sm text-chat-foreground">
          <ClaudeModsDrawContext.Provider value={scope}>
            <ClaudeModsNodeView node={band.tree} />
          </ClaudeModsDrawContext.Provider>
        </div>
      ) : null}
      {statuses.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 pb-1 text-xs text-chat-foreground-faint">
          {statuses.map(([plugin, text]) => (
            <span key={plugin} className="truncate" title={plugin}>
              {text}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
