import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import { useAppStore } from '../../../store'
import {
  requestClaudeMods,
  subscribeClaudeMods,
  supportsClaudeMods
} from '../../../runtime/claude-mods-surface-client'
import { ClaudeModsToaster } from './claude-mods-toasts'
import { disposeClaudeModsClientFrames } from './client/claude-mods-client-frames'
import {
  ClaudeModsSurfaceController,
  type ClaudeModsSnapshot
} from './claude-mods-surface-controller'

const IDLE_SNAPSHOT: ClaudeModsSnapshot = {
  available: false,
  roster: { panes: [], shown_id: null, focused_id: null, focus_requested_id: null },
  statuses: {},
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
  /** Whether the chat is on screen; toasts wait for it. Absent means visible. */
  isVisible?: boolean
}): ClaudeModsSurface {
  // Absent means on in this fork; only an explicit off keeps the chat from attaching.
  const enabled = useAppStore((store) => store.settings?.nativeChatClaudeMods !== false)
  const wanted = enabled && input.agent === 'claude'
  const [controller, setController] = useState<ClaudeModsSurfaceController | null>(null)
  const { sessionId, target } = input
  const isVisible = input.isVisible !== false
  const visibleRef = useRef(isVisible)
  const toasterRef = useRef<ClaudeModsToaster | null>(null)
  useEffect(() => {
    visibleRef.current = isVisible
    toasterRef.current?.setVisible(isVisible)
  }, [isVisible])
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
      const toaster = new ClaudeModsToaster(sessionId, visibleRef.current)
      toasterRef.current = toaster
      started = new ClaudeModsSurfaceController(
        {
          request: (subtype, fields) => requestClaudeMods(target, sessionId, subtype, fields),
          subscribe: (handlers) => subscribeClaudeMods(target, sessionId, handlers)
        },
        (plugin, text, timeoutMs) => toaster.push(plugin, text, timeoutMs)
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
      toasterRef.current = null
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
