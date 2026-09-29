// Mirror of daemon's `DaemonSessionInfo` (src/main/daemon/types.ts); not imported — preload can't depend on main-only protocol types.
export type PtyManagementSession = {
  sessionId: string
  incarnationId?: string
  state: 'created' | 'spawning' | 'running' | 'exiting' | 'exited'
  shellState: 'pending' | 'ready' | 'timed_out' | 'unsupported'
  isAlive: boolean
  pid: number | null
  cwd: string | null
  cols: number
  rows: number
  createdAt: number
  protocolVersion: number
  agentOwnership?: 'present' | 'absent' | 'unknown'
  paneBound?: true
  worktreeId?: string
}

export type PtyManagementInventoryStatus = 'complete' | 'unverifiable'
export type PtyManagementTerminationStatus = 'live' | 'unverifiable' | 'exited'

// 'severed': macOS can no longer attribute daemon terminals to Orca, so Accessibility/
// Automation grants silently stop applying until the daemon is restarted (STA-3491).
export type PtyManagementMacTccAttributionHealth = 'intact' | 'severed' | 'unknown'

export type PtyManagementApi = {
  // `degraded`: daemon is alive but can't spawn fresh PTYs, so new terminals run locally without daemon persistence.
  listSessions: () => Promise<{
    sessions: PtyManagementSession[]
    degraded: boolean
    inventoryStatus?: PtyManagementInventoryStatus
  }>
  killAll: () => Promise<{
    killedCount: number
    remainingCount: number
    killedSessionIds?: string[]
    status?: PtyManagementTerminationStatus
    inventoryStatus?: PtyManagementInventoryStatus
  }>
  killOne: (args: { sessionId: string; incarnationId?: string }) => Promise<{
    success: boolean
    status?: PtyManagementTerminationStatus
  }>
  restart: () => Promise<{ success: boolean }>
  macTccAttribution: () => Promise<{ health: PtyManagementMacTccAttributionHealth }>
}
