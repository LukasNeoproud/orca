import { useBacklogPairedSshAgents } from './use-backlog-paired-ssh-agents'
import { useState } from 'react'
import { useAppStore } from '@/store'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { isTuiAgentEnabled } from '../../../../shared/tui-agent-selection'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { pickQuickWorkspaceAgent } from '@/lib/quick-workspace-agent-selection'
import type { BacklogRoute } from '@/lib/backlog-rpc'

export function useBacklogTaskAgent(route: BacklogRoute) {
  const settings = useAppStore((state) => state.settings)
  const host = parseExecutionHostId(route.executionHostId)
  const pairedSsh = host?.kind === 'ssh' && route.runtimeEnvironmentId !== null
  const pairedDetection = useBacklogPairedSshAgents(
    pairedSsh ? route.runtimeEnvironmentId : null,
    pairedSsh ? host.targetId : null
  )
  const normalDetection = useDetectedAgents(
    pairedSsh
      ? undefined
      : host?.kind === 'ssh'
        ? { kind: 'ssh', connectionId: host.targetId }
        : host?.kind === 'runtime'
          ? { kind: 'runtime', environmentId: host.environmentId }
          : { kind: 'local', worktreeId: route.workspaceId }
  )
  const detection = pairedSsh ? pairedDetection : normalDetection
  const [override, setAgent] = useState<TuiAgent | null>(null)
  const agents = getAgentCatalog().filter(
    (entry) =>
      detection.detectedIds?.includes(entry.id) &&
      isTuiAgentEnabled(entry.id, settings?.disabledTuiAgents)
  )
  const preferred = pickQuickWorkspaceAgent(
    settings?.defaultTuiAgent,
    detection.detectedIds ?? [],
    settings?.disabledTuiAgents
  )
  const agent = agents.some((entry) => entry.id === override) ? override : preferred
  return { ...detection, agents, agent, setAgent, defaultAgent: settings?.defaultTuiAgent }
}
