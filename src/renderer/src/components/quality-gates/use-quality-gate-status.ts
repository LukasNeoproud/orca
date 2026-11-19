import { useCallback, useEffect, useRef, useState } from 'react'
import {
  classifyQualityGateCallFailure,
  fetchQualityGateStatus,
  qualityGateChangesSupported,
  qualityGatesSupported,
  subscribeQualityGateChanges
} from '@/lib/quality-gate-client'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import {
  emptyQualityGateStatusView,
  nextQualityGatePollDelay,
  type QualityGateStatusView
} from './quality-gate-status-view'

const STREAM_RETRY_MS = 5_000

/**
 * The latest run of each gate in one workspace, read from the host that owns it. `revision`
 * re-reads after the gates themselves changed.
 *
 * Without `watch` it asks again only while a run is in progress. With `watch` it follows the
 * workspace: through the host's change stream when the host has one, on an interval otherwise.
 */
export function useQualityGateStatus(
  target: RuntimeClientTarget | null,
  worktreeId: string | null,
  revision: string,
  options: { watch?: boolean } = {}
): { view: QualityGateStatusView; refresh: () => void } {
  // Why primitives: a fresh target object per render must not restart polling.
  const hasTarget = target !== null
  const environmentId = target?.kind === 'environment' ? target.environmentId : null
  const watch = options.watch === true
  const scope = `${hasTarget ? (environmentId ?? 'local') : ''}\0${worktreeId ?? ''}`
  const [stored, setStored] = useState<QualityGateStatusView>(() =>
    emptyQualityGateStatusView(scope)
  )
  const latest = useRef(stored)
  const [refreshCount, setRefreshCount] = useState(0)

  useEffect(() => {
    if (!hasTarget || !worktreeId) {
      return
    }
    const owner = runtimeTargetForOwnerEnvironment(environmentId)
    let cancelled = false
    let timer: number | null = null
    let streamTimer: number | null = null
    let stream: { close: () => void } | null = null
    let streaming = false
    let reading = false
    let readAgain = false

    const apply = (update: (current: QualityGateStatusView) => QualityGateStatusView): void => {
      if (cancelled) {
        return
      }
      const current = latest.current.scope === scope ? latest.current : null
      const next = update(current ?? emptyQualityGateStatusView(scope))
      latest.current = next
      setStored(next)
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      const delay = nextQualityGatePollDelay(next, { watch, streaming })
      timer = delay === null ? null : window.setTimeout(read, delay)
    }
    const poll = async (): Promise<void> => {
      try {
        if (!(await qualityGatesSupported(owner))) {
          apply(() => ({ ...emptyQualityGateStatusView(scope), unsupported: true }))
          return
        }
        const status = await fetchQualityGateStatus(owner, worktreeId)
        apply(() => ({ ...emptyQualityGateStatusView(scope), status }))
      } catch (error) {
        const failure = classifyQualityGateCallFailure(error)
        if (failure === 'unsupported') {
          apply(() => ({ ...emptyQualityGateStatusView(scope), unsupported: true }))
        } else if (failure === 'contact-lost') {
          apply((current) => ({ ...current, contactLost: true, error: null }))
        } else {
          apply((current) => ({
            ...current,
            contactLost: false,
            error: error instanceof Error ? error.message : String(error)
          }))
        }
      }
    }
    // One read at a time: a signal that arrives mid-read asks for one more, not a parallel one.
    function read(): void {
      if (cancelled) {
        return
      }
      if (reading) {
        readAgain = true
        return
      }
      reading = true
      void poll().finally(() => {
        reading = false
        if (readAgain) {
          readAgain = false
          read()
        }
      })
    }
    const openStream = async (): Promise<void> => {
      streamTimer = null
      const retryLater = (): void => {
        if (!cancelled) {
          streamTimer = window.setTimeout(() => void openStream(), STREAM_RETRY_MS)
        }
      }
      try {
        // An older host: the interval of a watching panel stands in for the stream.
        if (!(await qualityGateChangesSupported(owner))) {
          return
        }
        const opened = await subscribeQualityGateChanges(owner, worktreeId, {
          onChanged: () => {
            streaming = true
            read()
          },
          onLost: (unsupported) => {
            streaming = false
            stream = null
            read()
            if (!unsupported) {
              retryLater()
            }
          }
        })
        if (cancelled) {
          opened.close()
        } else {
          stream = opened
        }
      } catch {
        retryLater()
      }
    }

    read()
    if (watch) {
      void openStream()
    }
    return () => {
      cancelled = true
      stream?.close()
      for (const pending of [timer, streamTimer]) {
        if (pending !== null) {
          window.clearTimeout(pending)
        }
      }
    }
  }, [hasTarget, environmentId, worktreeId, scope, revision, refreshCount, watch])

  const refresh = useCallback(() => setRefreshCount((count) => count + 1), [])
  return { view: stored.scope === scope ? stored : emptyQualityGateStatusView(scope), refresh }
}
