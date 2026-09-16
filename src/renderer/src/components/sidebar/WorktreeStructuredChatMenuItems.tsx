import { Loader2 } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { translate } from '@/i18n/i18n'
import { AgentIcon } from '@/lib/agent-catalog'
import {
  startStructuredAgentLaunch,
  useStructuredAgentLaunchStatus
} from '@/lib/structured-agent-session-launch'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import { useStructuredAgentLaunchSupport } from '@/components/native-chat/use-structured-agent-launch-support'
import { useAppStore } from '@/store'
import {
  DEFAULT_DISABLED_TUI_AGENTS,
  filterEnabledTuiAgents
} from '../../../../shared/tui-agent-selection'

export function WorktreeStructuredChatMenuItems({
  worktreeId,
  disabled
}: {
  worktreeId: string
  disabled: boolean
}): React.JSX.Element | null {
  const detectionTarget = useAgentDetectionTargetForWorktree(worktreeId)
  const { detectedIds } = useDetectedAgents(detectionTarget)
  const disabledAgents = useAppStore(
    (state) => state.settings?.disabledTuiAgents ?? DEFAULT_DISABLED_TUI_AGENTS
  )
  const support = useStructuredAgentLaunchSupport(worktreeId)
  const claudeStatus = useStructuredAgentLaunchStatus(worktreeId, 'claude')
  const codexStatus = useStructuredAgentLaunchStatus(worktreeId, 'codex')
  const enabledAgents = new Set(filterEnabledTuiAgents(detectedIds ?? [], disabledAgents))
  const agents = (['claude', 'codex'] as const).filter(
    (agent) => support[agent] && enabledAgents.has(agent)
  )
  if (agents.length === 0) {
    return null
  }
  const status = { claude: claudeStatus, codex: codexStatus }
  return (
    <>
      {agents.map((agent) => {
        const isPending = status[agent] === 'pending'
        const provider = agent === 'claude' ? 'Claude' : 'Codex'
        const label = isPending
          ? translate(
              'components.native-chat.structuredSessionLaunchPending',
              'Starting {{value0}} chat…',
              { value0: provider }
            )
          : translate('components.native-chat.newStructuredChat', 'New {{value0}} Chat', {
              value0: provider
            })
        return (
          <DropdownMenuItem
            key={agent}
            disabled={disabled || isPending}
            onSelect={() => startStructuredAgentLaunch(worktreeId, agent)}
            title={label}
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <AgentIcon agent={agent} size={14} />
            )}
            {label}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}
