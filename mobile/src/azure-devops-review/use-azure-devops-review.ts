import { useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AZURE_DEVOPS_REVIEW_RUNTIME_CAPABILITY } from '../../../src/shared/host-feature-runtime-capabilities'
import {
  DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS,
  type AzureDevOpsReviewFilters
} from '../../../src/shared/azure-devops-review-filters'
import type {
  AzureDevOpsReviewDetail,
  AzureDevOpsReviewListResult
} from '../../../src/shared/azure-devops-review-types'
import type { RpcClient } from '../transport/rpc-client'
import { startRuntimeCapabilityProbe } from '../transport/runtime-capability-probe'

const FILTERS_KEY = 'orca.azureDevOpsReview.filters'
const REQUEST_TIMEOUT_MS = 60_000

export async function azureDevOpsReviewRequest<T>(
  client: RpcClient | null,
  method: string,
  params?: unknown
): Promise<T> {
  if (!client) {
    throw new Error('Not connected to the host.')
  }
  const response = await client.sendRequest(method, params, {
    timeoutMs: REQUEST_TIMEOUT_MS,
    failWhenDisconnected: true
  })
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  return response.result as T
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Null while probing; false when the host predates Azure DevOps review. */
export function useAzureDevOpsReviewSupport(
  client: RpcClient | null,
  connected: boolean
): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null)
  useEffect(() => {
    setSupported(null)
    if (!client || !connected) {
      return
    }
    return startRuntimeCapabilityProbe(client, (capabilities) =>
      setSupported(capabilities.includes(AZURE_DEVOPS_REVIEW_RUNTIME_CAPABILITY))
    )
  }, [client, connected])
  return supported
}

export function useAzureDevOpsReviewFilters(): [
  AzureDevOpsReviewFilters,
  (patch: Partial<AzureDevOpsReviewFilters>) => void
] {
  const [filters, setFilters] = useState(DEFAULT_AZURE_DEVOPS_REVIEW_FILTERS)
  useEffect(() => {
    void AsyncStorage.getItem(FILTERS_KEY)
      .then((raw) => {
        const parsed = raw ? (JSON.parse(raw) as Partial<AzureDevOpsReviewFilters>) : null
        if (parsed) {
          setFilters((current) => ({ ...current, ...parsed, query: '' }))
        }
      })
      .catch(() => undefined)
  }, [])
  const latest = useRef(filters)
  latest.current = filters
  const update = useCallback((patch: Partial<AzureDevOpsReviewFilters>) => {
    const next = { ...latest.current, ...patch }
    latest.current = next
    setFilters(next)
    void AsyncStorage.setItem(
      FILTERS_KEY,
      JSON.stringify({ project: next.project, repo: next.repo, status: next.status })
    ).catch(() => undefined)
  }, [])
  return [filters, update]
}

export function useAzureDevOpsReviewList(
  client: RpcClient | null,
  enabled: boolean,
  status: AzureDevOpsReviewFilters['status']
) {
  const [result, setResult] = useState<AzureDevOpsReviewListResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  const refresh = useCallback(async () => {
    if (!enabled) {
      return
    }
    const current = ++generation.current
    setLoading(true)
    setError(null)
    try {
      const next = await azureDevOpsReviewRequest<AzureDevOpsReviewListResult>(
        client,
        'azureDevOpsReview.list',
        { status }
      )
      if (current === generation.current) {
        setResult(next)
      }
    } catch (err) {
      if (current === generation.current) {
        setError(errorText(err))
      }
    } finally {
      if (current === generation.current) {
        setLoading(false)
      }
    }
  }, [client, enabled, status])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { result, loading, error, refresh }
}

export function useAzureDevOpsReviewDetail(
  client: RpcClient | null,
  enabled: boolean,
  pullRequestKey: string
) {
  const [detail, setDetail] = useState<AzureDevOpsReviewDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  const reload = useCallback(async () => {
    if (!enabled || !pullRequestKey) {
      return
    }
    const current = ++generation.current
    setLoading(true)
    setError(null)
    try {
      const next = await azureDevOpsReviewRequest<AzureDevOpsReviewDetail>(
        client,
        'azureDevOpsReview.get',
        { pullRequestKey }
      )
      if (current === generation.current) {
        setDetail(next)
      }
    } catch (err) {
      if (current === generation.current) {
        setError(errorText(err))
      }
    } finally {
      if (current === generation.current) {
        setLoading(false)
      }
    }
  }, [client, enabled, pullRequestKey])

  useEffect(() => {
    void reload()
  }, [reload])

  return { detail, loading, error, reload }
}
