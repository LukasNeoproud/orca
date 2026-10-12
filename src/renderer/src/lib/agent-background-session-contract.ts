import type { ParsedAgentStatusPayload } from '../../../shared/agent-status-types'
import type { LaunchSource } from '../../../shared/telemetry-events'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { AgentStartupPlan } from '@/lib/tui-agent-startup'
import type { AutomationTerminalOwnership } from '@/lib/automation-terminal-ownership'
import type { ExecutionHostId } from '../../../shared/execution-host'

export type LaunchAgentBackgroundSessionArgs = {
  agent: TuiAgent
  worktreeId: string
  /** Pins duplicate workspace ids to the host chosen by the caller. */
  executionHostId?: ExecutionHostId
  /** Pins paired-runtime transport; explicit null selects the desktop runtime. */
  runtimeEnvironmentId?: string | null
  prompt?: string
  /** An automation's saved extras, merged over this host's default Arguments. */
  extraAgentArgs?: string
  launchSource?: LaunchSource
  title?: string
  onData?: (chunk: string) => void
  onExit?: (ptyId: string, code: number) => void
  onAgentStatus?: (payload: ParsedAgentStatusPayload) => void
}

export type LaunchAgentBackgroundSessionResult = {
  tabId: string
  paneKey: string
  ptyId: string
  startupPlan: AgentStartupPlan
  terminalOwnership: AutomationTerminalOwnership | null
}
