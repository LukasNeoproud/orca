import type { DashboardCardTerminalInput } from '../../../../shared/dashboard-snapshot'

export type AgentTerminalPreviewProps = {
  ptyId: string
  /** Host-input facts relayed with the card; null routes bytes by client OS. */
  terminalInput?: DashboardCardTerminalInput | null
  /** Observe the PTY without sending input, claiming focus, or changing its grid. */
  readOnly?: boolean
  className?: string
}
