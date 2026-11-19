import { useCallback, useEffect, useRef, useState } from 'react'
import {
  classifyQualityGateCallFailure,
  fetchQualityGateStatus,
  qualityGatesSupported
} from '@/lib/quality-gate-client'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import {
  emptyQualityGateStatusView,
  nextQualityGatePollDelay,
  type QualityGateStatusView
} from './quality-gate-status-view'

/**
 * The latest run of each gate in one workspace, read from the host that owns it. Asks again only
 * while a run is in progress; `revision` re-reads after the gates themselves changed.
 */
export function useQualityGateStatus(
  target: RuntimeClientTarget | null,
  worktreeId: string | null,
  revision: string
): { view: QualityGateStatusView; refresh: () => void } {
  // Why primitives: a fresh target object per render must not restart polling.
  const hasTarget = target !== null
  const environmentId = target?.kind === 'environment' ? target.environmentId : null
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
    const apply = (update: (current: QualityGateStatusView) => QualityGateStatusView): void => {
      if (cancelled) {
        return
      }
      const current = latest.current.scope === scope ? latest.current : null
      const next = update(current ?? emptyQualityGateStatusView(scope))
      latest.current = next
      setStored(next)
      const delay = nextQualityGatePollDelay(next)
      if (delay !== null) {
        timer = window.setTimeout(() => void poll(), delay)
      }
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
    void poll()
    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [hasTarget, environmentId, worktreeId, scope, revision, refreshCount])

  const refresh = useCallback(() => setRefreshCount((count) => count + 1), [])
  return { view: stored.scope === scope ? stored : emptyQualityGateStatusView(scope), refresh }
}
