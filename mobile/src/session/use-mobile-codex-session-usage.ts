import { useEffect, useState } from 'react'
import type {
  AgentSessionStatusEvent,
  AgentSessionStatusSummary
} from '../../../src/shared/agent-session-wire'
import { parseNativeChatUsageStatus } from '../../../src/shared/native-chat-usage-status'
import { AGENT_SESSION_STATUS_FEED_RUNTIME_CAPABILITY } from '../../../src/shared/protocol-version'
import type { RpcClient } from '../transport/rpc-client'
import { startRuntimeCapabilityProbe } from '../transport/runtime-capability-probe'
import type { MobileCodexSessionUsage } from './mobile-codex-session-usage'

export function useMobileCodexSessionUsage(args: {
  agent: string | null
  client: RpcClient | null
  enabled: boolean
  sessionId: string | null
}): MobileCodexSessionUsage | null {
  const { agent, client, enabled, sessionId } = args
  const [scopedUsage, setScopedUsage] = useState<{
    client: RpcClient
    sessionId: string
    usage: MobileCodexSessionUsage
  } | null>(null)

  useEffect(() => {
    if (agent !== 'codex' || !client || !enabled || !sessionId) {
      return
    }
    let current = true
    let unsubscribeStream: (() => void) | null = null
    const clear = (): void => {
      if (current) {
        setScopedUsage(null)
      }
    }
    const unsubscribeState =
      client.onStateChange?.((state) => {
        if (state !== 'connected') {
          clear()
        }
      }) ?? (() => undefined)
    const stopProbe = startRuntimeCapabilityProbe(client, (capabilities) => {
      if (!current || !capabilities.includes(AGENT_SESSION_STATUS_FEED_RUNTIME_CAPABILITY)) {
        return
      }
      unsubscribeStream = client.subscribe('agentSession.subscribeStatus', null, (raw) => {
        if (!current) {
          return
        }
        const summary = sessionSummary(raw, sessionId)
        if (summary === undefined) {
          return
        }
        const usage = summary ? parseNativeChatUsageStatus(summary) : null
        setScopedUsage(usage ? { client, sessionId, usage } : null)
      })
    })
    return () => {
      current = false
      stopProbe()
      unsubscribeState()
      unsubscribeStream?.()
    }
  }, [agent, client, enabled, sessionId])

  return scopedUsage?.client === client && scopedUsage.sessionId === sessionId
    ? scopedUsage.usage
    : null
}

function sessionSummary(
  raw: unknown,
  sessionId: string
): AgentSessionStatusSummary | null | undefined {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const event = raw as Partial<AgentSessionStatusEvent>
  if (event.type === 'status') {
    return event.session?.sessionId === sessionId ? event.session : undefined
  }
  if (event.type === 'snapshot') {
    return event.sessions?.find((session) => session.sessionId === sessionId) ?? null
  }
  return event.type === 'end' ? null : undefined
}
