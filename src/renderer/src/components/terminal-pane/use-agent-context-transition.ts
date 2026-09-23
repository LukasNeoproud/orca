import { useEffect, useRef, useState } from 'react'
import type { CodexConversationContinuationSource } from './codex-conversation-continuation-source'
import {
  claimAgentContextTerminalSurface,
  completeAgentContextTerminalSurface,
  readAgentContextTerminalSurface
} from './agent-context-terminal-surface-client'

type RestartCodexConversationPane = (input: {
  paneId: number
  mode: 'compacted' | 'fresh'
  sourceProviderSessionId: string
  providerSessionId: string
  transcriptPath: string | null
  resumeCandidate: true
}) => Promise<void>

export type AgentContextTransitionState =
  | { phase: 'idle' }
  | { phase: 'switching'; message: string }
  | { phase: 'failed'; message: string }

const POLL_INTERVAL_MS = 1_500

/** Bridges a host-authorized context request to the renderer-owned pane restart. */
export function useAgentContextTransition(input: {
  source: CodexConversationContinuationSource | null
  enabled: boolean
  restartCodexConversationPane: RestartCodexConversationPane
}): AgentContextTransitionState {
  const { source, enabled, restartCodexConversationPane } = input
  const [state, setState] = useState<AgentContextTransitionState>({ phase: 'idle' })
  const restartRef = useRef(restartCodexConversationPane)
  restartRef.current = restartCodexConversationPane

  useEffect(() => {
    if (!source || !enabled) {
      setState({ phase: 'idle' })
      return
    }
    let disposed = false
    let polling = false
    const poll = async (): Promise<void> => {
      if (disposed || polling) {
        return
      }
      polling = true
      try {
        const request = await readAgentContextTerminalSurface(source.target, {
          paneKey: source.paneKey,
          providerSessionId: source.providerSessionId
        })
        if (disposed || !request || !request.candidate) {
          return
        }
        const claim = await claimAgentContextTerminalSurface(source.target, {
          requestId: request.requestId,
          paneKey: source.paneKey,
          providerSessionId: source.providerSessionId
        })
        if (disposed) {
          return
        }
        setState({ phase: 'switching', message: 'Switching to the requested context…' })
        try {
          await restartRef.current({
            paneId: source.paneId,
            mode: request.mode,
            sourceProviderSessionId: source.providerSessionId,
            providerSessionId: request.candidate.providerSessionId,
            transcriptPath: request.candidate.transcriptPath ?? null,
            resumeCandidate: true
          })
          await completeAgentContextTerminalSurface(source.target, {
            requestId: request.requestId,
            claimId: claim.claimId,
            result: { status: 'completed' }
          })
          if (!disposed) {
            setState({ phase: 'idle' })
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await completeAgentContextTerminalSurface(source.target, {
            requestId: request.requestId,
            claimId: claim.claimId,
            result: { status: 'failed', error: message }
          }).catch(() => undefined)
          if (!disposed) {
            setState({ phase: 'failed', message })
          }
        }
      } catch {
        // The host may not have an offer yet. Polling is intentionally quiet so
        // transient renderer/runtime reconnects do not look like failed work.
      } finally {
        polling = false
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [enabled, source])

  return state
}
