import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentJournalSubmission } from '../../../src/shared/agent-session-journal-types'
import type { AgentSessionSendResult } from '../../../src/shared/agent-session-wire'
import type { RpcClient } from '../transport/rpc-client'
import { requestStructuredAgentSessionMutation } from './mobile-structured-agent-session-rpc'
import {
  loadMobileStructuredSendRetries,
  removeMobileStructuredSendRetries,
  saveMobileStructuredSendRetry,
  type MobileStructuredSendRetryEntry
} from './mobile-structured-send-retry-storage'

export function useMobileStructuredSendRetry(args: {
  client: RpcClient | null
  connected: boolean
  enabled: boolean
  ready: boolean
  sessionId: string | null
  sessionKey: string
  submissions: readonly AgentJournalSubmission[]
}) {
  const { client, connected, enabled, ready, sessionId, sessionKey, submissions } = args
  const [entries, setEntries] = useState<MobileStructuredSendRetryEntry[]>([])
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const retrying = useRef(new Set<string>())
  const accepted = new Set(
    submissions
      .filter((item) => item.dispatchState === 'accepted')
      .map((item) => item.clientMessageId)
  )
  const acceptedRef = useRef(accepted)
  acceptedRef.current = accepted
  const retryable =
    ready && loadedScope === sessionKey
      ? entries.filter(
          (entry) =>
            entry.sessionKey === sessionKey &&
            entry.sessionId === sessionId &&
            !accepted.has(entry.operationId)
        )
      : []

  useEffect(() => {
    setLoadedScope(null)
    if (!ready || !sessionId) {
      return
    }
    let active = true
    void loadMobileStructuredSendRetries(sessionKey, sessionId, accepted)
      .then((loaded) => {
        if (!active) {
          return
        }
        setEntries((current) => [
          ...current.filter((entry) => entry.sessionKey !== sessionKey),
          ...loaded
        ])
        setLoadedScope(sessionKey)
        setError(null)
      })
      .catch((failure: unknown) => {
        if (active) {
          setError(
            failure instanceof Error ? failure.message : 'Saved retry details are unavailable.'
          )
        }
      })
    return () => {
      active = false
    }
  }, [ready, sessionId, sessionKey, submissions])

  const rememberUnknown = useCallback(
    async (entry: MobileStructuredSendRetryEntry): Promise<void> => {
      if (acceptedRef.current.has(entry.operationId)) {
        return
      }
      try {
        await saveMobileStructuredSendRetry(entry)
        if (acceptedRef.current.has(entry.operationId)) {
          await removeMobileStructuredSendRetries(entry.sessionKey, new Set([entry.operationId]))
          return
        }
        setEntries((current) =>
          [...current.filter((item) => item.operationId !== entry.operationId), entry].slice(-64)
        )
        setError(null)
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Could not save retry details.')
      }
    },
    []
  )
  const clear = useCallback(
    async (operationId: string): Promise<void> => {
      setEntries((current) => current.filter((entry) => entry.operationId !== operationId))
      try {
        await removeMobileStructuredSendRetries(sessionKey, new Set([operationId]))
        setError(null)
      } catch {
        setError('Confirmed delivery could not be removed from saved retry details.')
      } finally {
        setEntries((current) => current.filter((entry) => entry.operationId !== operationId))
      }
    },
    [sessionKey]
  )

  const retry = useCallback(
    async (operationId: string): Promise<boolean> => {
      const entry = retryable.find((item) => item.operationId === operationId)
      if (
        !client ||
        !connected ||
        !enabled ||
        !sessionId ||
        !entry ||
        retrying.current.has(operationId)
      ) {
        return false
      }
      retrying.current.add(operationId)
      setPendingId(operationId)
      setError(null)
      try {
        const result = await requestStructuredAgentSessionMutation<AgentSessionSendResult>({
          client,
          method: 'agentSession.send',
          fingerprintMethod: 'agentSession.send',
          sessionId: entry.sessionId,
          expectedRuntimeFence: entry.fence,
          fields: { body: entry.body },
          clientOperationId: entry.operationId,
          retryUnknown: true
        })
        if (result.status === 'accepted') {
          await clear(operationId)
          return true
        }
        setError(
          result.status === 'unknown'
            ? 'Delivery is still unconfirmed. Check the conversation before retrying.'
            : result.message
        )
        return false
      } finally {
        retrying.current.delete(operationId)
        setPendingId(null)
      }
    },
    [clear, client, connected, enabled, retryable, sessionId]
  )

  return {
    retryable,
    rememberUnknown,
    clear,
    retry,
    pendingId,
    error,
    canRetry: Boolean(client && connected && enabled && ready)
  }
}
