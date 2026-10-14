import { useEffect, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import { useAppStore } from '../../../store'
import {
  requestClaudeMods,
  subscribeClaudeMods,
  supportsClaudeMods
} from '../../../runtime/claude-mods-surface-client'
import { disposeClaudeModsClientFrames } from './client/claude-mods-client-frames'
import {
  ClaudeModsSurfaceController,
  type ClaudeModsSnapshot
} from './claude-mods-surface-controller'

const IDLE_SNAPSHOT: ClaudeModsSnapshot = {
  available: false,
  roster: { panes: [], shown_id: null, focused_id: null, focus_requested_id: null },
  statuses: {},
  logs: [],
  drawings: {}
}

const noopSubscribe = (): (() => void) => () => {}
const idleSnapshot = (): ClaudeModsSnapshot => IDLE_SNAPSHOT

export type ClaudeModsSurface = {
  controller: ClaudeModsSurfaceController | null
  snapshot: ClaudeModsSnapshot
}

/** A Claude chat's mods surface while the setting is on and its host forwards it; idle otherwise. */
export function useClaudeModsSurface(input: {
  agent: string
  sessionId: string
  target: RuntimeClientTarget
}): ClaudeModsSurface {
  // Absent means on in this fork; only an explicit off keeps the chat from attaching.
  const enabled = useAppStore((store) => store.settings?.nativeChatClaudeMods !== false)
  const wanted = enabled && input.agent === 'claude'
  const [controller, setController] = useState<ClaudeModsSurfaceController | null>(null)
  const { sessionId, target } = input
  const targetKey = target.kind === 'local' ? 'local' : target.environmentId
  useEffect(() => {
    if (!wanted) {
      return
    }
    let cancelled = false
    let started: ClaudeModsSurfaceController | null = null
    void supportsClaudeMods(target).then((supported) => {
      if (cancelled || !supported) {
        return
      }
      started = new ClaudeModsSurfaceController(
        {
          request: (subtype, fields) => requestClaudeMods(target, sessionId, subtype, fields),
          subscribe: (handlers) => subscribeClaudeMods(target, sessionId, handlers)
        },
        (plugin, text, timeoutMs) =>
          toast(text, { description: plugin, ...(timeoutMs ? { duration: timeoutMs } : {}) })
      )
      started.start()
      setController(started)
    })
    return () => {
      cancelled = true
      if (started) {
        disposeClaudeModsClientFrames(started)
        started.stop()
      }
      setController(null)
    }
    // targetKey stands for target: a fresh object per render must not resubscribe.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, sessionId, targetKey])
  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    controller?.getSnapshot ?? idleSnapshot
  )
  return { controller, snapshot }
}
