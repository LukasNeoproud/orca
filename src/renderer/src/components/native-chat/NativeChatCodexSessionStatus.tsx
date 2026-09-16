import { useEffect, useMemo, useState } from 'react'
import type { CodexContextUsage, CodexWeeklyUsage } from '../../../../shared/codex-context-usage'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'
import { useStructuredAgentSessionStatusSummary } from './StructuredAgentSessionStatusBridge'
import { NativeChatCodexStatus } from './NativeChatCodexStatus'

type Props = {
  contextUsage?: CodexContextUsage
  codexWeeklyUsage?: CodexWeeklyUsage
  transport?: NativeChatStructuredComposerTransport
}

export function NativeChatCodexSessionStatus(props: Props): React.JSX.Element {
  const weeklyUsedPercent = useWeeklyUsedPercent(props.codexWeeklyUsage)
  return props.transport ? (
    <StructuredCodexStatus transport={props.transport} />
  ) : (
    <NativeChatCodexStatus
      contextUsage={props.contextUsage}
      weeklyUsedPercent={weeklyUsedPercent}
    />
  )
}

function useWeeklyUsedPercent(usage: Props['codexWeeklyUsage']): number | undefined {
  const [now, setNow] = useState(Date.now)
  const resetsAt = usage?.resetsAt
  useEffect(() => {
    setNow(Date.now())
    if (resetsAt === undefined || !Number.isFinite(resetsAt)) {
      return
    }
    const delay = resetsAt - Date.now()
    if (delay <= 0) {
      return
    }
    const timer = setTimeout(() => setNow(Date.now()), Math.min(delay + 1, 2_147_483_647))
    return () => clearTimeout(timer)
  }, [resetsAt])
  return usage?.resetsAt !== undefined && usage.resetsAt <= now ? undefined : usage?.usedPercent
}

function StructuredCodexStatus({
  transport
}: {
  transport: NativeChatStructuredComposerTransport
}): React.JSX.Element {
  const target = useMemo(
    () => getActiveRuntimeTarget({ activeRuntimeEnvironmentId: transport.runtimeEnvironmentId }),
    [transport.runtimeEnvironmentId]
  )
  const summary = useStructuredAgentSessionStatusSummary(transport.sessionId, target)
  const weeklyUsedPercent = useWeeklyUsedPercent(summary?.codexWeeklyUsage)
  return (
    <NativeChatCodexStatus
      contextUsage={summary?.contextUsage}
      weeklyUsedPercent={weeklyUsedPercent}
    />
  )
}
