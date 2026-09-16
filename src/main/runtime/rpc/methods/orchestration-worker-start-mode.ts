/** Ordinary worker starts remain terminal-backed; Chat UI defaults affect presentation only. */

import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { NativeChatDefaultSettings } from '../../../../shared/structured-native-chat-launch-route'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { OrcaRuntimeService } from '../../orca-runtime'

export type WorkerStartMode = 'structured' | 'terminal'

export type WorkerStartModeReason =
  | 'user_default'
  | 'remote_execution_host'
  | 'reused_terminal'
  | 'worktree_creation'
  | 'launch_preferences'
  | 'agent_without_structured_session'
  | 'tui_launch_customization'
  | 'structured_sessions_unavailable'
  | 'wsl_execution_runtime'
  | 'codex_on_windows'
  | 'structured_unsupported_on_host'

export type WorkerStartModeReceipt = {
  /** The mode the worker actually started in. */
  mode: WorkerStartMode
  /** The user's settings default for a new agent tab. */
  preferred: WorkerStartMode
  reason: WorkerStartModeReason
  /** One sentence, always present, so a fallback is never silent. */
  detail: string
}

type WorkerStartModeSettings = Partial<
  NativeChatDefaultSettings &
    Pick<GlobalSettings, 'agentCmdOverrides' | 'agentDefaultArgs' | 'agentDefaultEnv'>
>

type WorkerStartModePlacement = {
  agent?: string
  on?: string
  terminal?: string
  worktree?: string
  model?: string
  effort?: string
}

const DOWNGRADE_DETAIL: Record<Exclude<WorkerStartModeReason, 'user_default'>, string> = {
  remote_execution_host: '--on runs the worker on a remote execution host',
  reused_terminal: '--terminal reuses a running terminal agent',
  worktree_creation: 'a new worktree is created with its agent terminal',
  launch_preferences: '--model and --effort apply only to a terminal agent',
  agent_without_structured_session: 'this agent has no structured session',
  tui_launch_customization:
    'this agent has a custom launch command, arguments or environment that only a terminal applies',
  structured_sessions_unavailable: 'this runtime does not support structured agent sessions',
  wsl_execution_runtime: 'this workspace runs under WSL',
  codex_on_windows: 'Codex has no structured session on Windows',
  structured_unsupported_on_host: 'the execution host cannot create one here'
}

/** The host's own create-support verdict (`agentSession.createSupport`) in this vocabulary. */
const HOST_SUPPORT_REASON: Record<
  'agent' | 'remote' | 'wsl',
  Exclude<WorkerStartModeReason, 'user_default'>
> = {
  agent: 'structured_unsupported_on_host',
  remote: 'remote_execution_host',
  wsl: 'wsl_execution_runtime'
}

export function decideWorkerStartMode(_args: {
  params: WorkerStartModePlacement
  settings: WorkerStartModeSettings | null | undefined
}): WorkerStartModeReceipt {
  return {
    mode: 'terminal',
    preferred: 'terminal',
    reason: 'user_default',
    detail: 'Started a terminal agent worker. The Chat UI default changes only its display.'
  }
}

/**
 * Second half of the decision, once the worktree is resolved: the host that will run the worker
 * answers whether it can create a structured session there at all. Asked before anything is
 * created, so a refusal becomes a terminal worker rather than a failed start.
 */
export async function resolveWorkerStartModeOnHost(
  runtime: Pick<OrcaRuntimeService, 'getStructuredAgentSessionCreateSupport'>,
  mode: WorkerStartModeReceipt,
  worktreeId: string | undefined,
  agent: TuiAgent | undefined
): Promise<WorkerStartModeReceipt> {
  if (mode.mode !== 'structured' || !worktreeId) {
    return mode
  }
  return downgradeWorkerStartModeForHost(
    mode,
    await readStructuredCreateSupport(runtime, worktreeId, agent)
  )
}

/** A host that cannot answer has not proved it can create one, so the worker stays a PTY agent. */
async function readStructuredCreateSupport(
  runtime: Pick<OrcaRuntimeService, 'getStructuredAgentSessionCreateSupport'>,
  worktreeId: string,
  agent: TuiAgent | undefined
): Promise<{ supported: boolean; reason?: 'agent' | 'remote' | 'wsl' }> {
  if (agent !== 'claude' && agent !== 'codex') {
    return { supported: false, reason: 'agent' }
  }
  try {
    return await runtime.getStructuredAgentSessionCreateSupport(`id:${worktreeId}`, agent)
  } catch {
    return { supported: false }
  }
}

/**
 * Applies the executing host's `agentSession.createSupport` answer, which is the authority on WSL,
 * remoteness and the Windows process-start-time gate for the resolved workspace.
 */
export function downgradeWorkerStartModeForHost(
  receipt: WorkerStartModeReceipt,
  support: { supported: boolean; reason?: 'agent' | 'remote' | 'wsl' }
): WorkerStartModeReceipt {
  if (receipt.mode !== 'structured' || support.supported) {
    return receipt
  }
  return downgraded(
    support.reason ? HOST_SUPPORT_REASON[support.reason] : 'structured_unsupported_on_host'
  )
}

function downgraded(
  reason: Exclude<WorkerStartModeReason, 'user_default'>
): WorkerStartModeReceipt {
  return {
    mode: 'terminal',
    preferred: 'structured',
    reason,
    detail: `Your default is a structured chat session, but ${DOWNGRADE_DETAIL[reason]}; started a terminal agent worker instead.`
  }
}

/** The store can be missing on a runtime that never opened one; that reads as no preference. */
export function readWorkerStartModeSettings(
  runtime: Pick<OrcaRuntimeService, 'getClientSettings'>
): WorkerStartModeSettings | null {
  try {
    return runtime.getClientSettings()
  } catch {
    return null
  }
}
