import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  TerminalInteractionPendingRequest,
  TerminalInteractionRespondParams
} from '../../../../shared/terminal-interaction'
import type { OrcaInteractionResult } from '../../../../shared/orca-interaction'
import { TERMINAL_INTERACTION_RUNTIME_CAPABILITY } from '../../../../shared/host-feature-runtime-capabilities'
import { useAppStore } from '@/store'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from '@/runtime/runtime-rpc-client'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'

const POLL_INTERVAL_MS = 1_000
const POLL_TIMEOUT_MS = 5_000

export type RoutedTerminalInteractionRequest = TerminalInteractionPendingRequest & {
  key: string
  target: RuntimeClientTarget
  targetKey: string
}

function targetKey(target: RuntimeClientTarget): string {
  return target.kind === 'local' ? 'local' : `environment:${target.environmentId}`
}

function routePendingRequests(
  target: RuntimeClientTarget,
  requests: TerminalInteractionPendingRequest[]
): RoutedTerminalInteractionRequest[] {
  const ownerKey = targetKey(target)
  return requests.map((request) => ({
    ...request,
    target,
    targetKey: ownerKey,
    key: `${ownerKey}:${request.requestId}`
  }))
}

export async function readPendingTerminalInteractionRequests(
  target: RuntimeClientTarget
): Promise<RoutedTerminalInteractionRequest[] | null> {
  try {
    if (
      target.kind === 'environment' &&
      !(await runtimeEnvironmentSupportsCapability(
        target.environmentId,
        TERMINAL_INTERACTION_RUNTIME_CAPABILITY,
        POLL_TIMEOUT_MS
      ))
    ) {
      return []
    }
    const pending = await callRuntimeRpc<TerminalInteractionPendingRequest[]>(
      target,
      'terminalInteraction.pending',
      undefined,
      { timeoutMs: POLL_TIMEOUT_MS, reuseRecentCompatibilityFailure: true }
    )
    return routePendingRequests(target, pending)
  } catch {
    // Keep the last successful rows so a transient disconnect does not discard user drafts.
    return null
  }
}

function compareRequests(
  left: RoutedTerminalInteractionRequest,
  right: RoutedTerminalInteractionRequest
): number {
  return left.createdAt - right.createdAt || left.key.localeCompare(right.key)
}

export function useTerminalInteractionRequests(): {
  requests: RoutedTerminalInteractionRequest[]
  respond: (
    request: RoutedTerminalInteractionRequest,
    result: OrcaInteractionResult
  ) => Promise<void>
} {
  const runtimeEnvironments = useAppStore((state) => state.runtimeEnvironments)
  const runtimeStatuses = useAppStore((state) => state.runtimeStatusByEnvironmentId)
  const activeEnvironmentId = useAppStore(
    (state) => state.settings?.activeRuntimeEnvironmentId?.trim() || null
  )
  const environmentIds = useMemo(() => {
    const ids = runtimeEnvironments
      .map((environment) => environment.id)
      .filter(
        (environmentId) =>
          environmentId === activeEnvironmentId ||
          runtimeStatuses.get(environmentId)?.status != null
      )
    if (activeEnvironmentId && !ids.includes(activeEnvironmentId)) {
      ids.push(activeEnvironmentId)
    }
    return ids
  }, [activeEnvironmentId, runtimeEnvironments, runtimeStatuses])
  const targets = useMemo<RuntimeClientTarget[]>(
    () => [
      { kind: 'local' },
      ...environmentIds.map((environmentId) => ({
        kind: 'environment' as const,
        environmentId
      }))
    ],
    [environmentIds]
  )
  const targetKeys = useMemo(() => new Set(targets.map(targetKey)), [targets])
  const [requestsByTarget, setRequestsByTarget] = useState<
    Map<string, RoutedTerminalInteractionRequest[]>
  >(() => new Map())
  const pollGenerationRef = useRef(0)
  const responseGenerationRef = useRef(0)

  useEffect(() => {
    let disposed = false
    let polling = false
    const generation = ++pollGenerationRef.current
    const poll = async (): Promise<void> => {
      if (polling) {
        return
      }
      polling = true
      const responseGeneration = responseGenerationRef.current
      const results = await Promise.all(
        targets.map(async (target) => ({
          key: targetKey(target),
          requests: await readPendingTerminalInteractionRequests(target)
        }))
      )
      if (
        disposed ||
        pollGenerationRef.current !== generation ||
        responseGenerationRef.current !== responseGeneration
      ) {
        polling = false
        return
      }
      setRequestsByTarget((current) => {
        const next = new Map(current)
        for (const key of next.keys()) {
          if (!targetKeys.has(key)) {
            next.delete(key)
          }
        }
        for (const result of results) {
          if (result.requests !== null) {
            next.set(result.key, result.requests)
          }
        }
        return next
      })
      polling = false
    }
    void poll()
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS)
    return () => {
      disposed = true
      clearInterval(interval)
    }
  }, [targetKeys, targets])

  const respond = useCallback(
    async (request: RoutedTerminalInteractionRequest, result: OrcaInteractionResult) => {
      await callRuntimeRpc<{ accepted: true }>(
        request.target,
        'terminalInteraction.respond',
        { requestId: request.requestId, result } satisfies TerminalInteractionRespondParams,
        { timeoutMs: POLL_TIMEOUT_MS }
      )
      responseGenerationRef.current += 1
      setRequestsByTarget((current) => {
        const next = new Map(current)
        next.set(
          request.targetKey,
          (next.get(request.targetKey) ?? []).filter((entry) => entry.key !== request.key)
        )
        return next
      })
    },
    []
  )

  const requests = useMemo(
    () => Array.from(requestsByTarget.values()).flat().sort(compareRequests),
    [requestsByTarget]
  )
  return { requests, respond }
}
