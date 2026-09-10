import type { AgentSessionHandoffStatus } from '../../../../shared/agent-session-wire'

export function canShowAdoptedTerminal(
  status: AgentSessionHandoffStatus | null | undefined,
  composerPaneKey: string | undefined
): boolean {
  return Boolean(
    composerPaneKey &&
    status?.owner === 'tui' &&
    status.terminal?.paneKey === composerPaneKey &&
    (status.phase === 'idle' ||
      status.phase === 'queued' ||
      (status.phase === 'failed' && status.error?.recoverableOwner === 'tui'))
  )
}
