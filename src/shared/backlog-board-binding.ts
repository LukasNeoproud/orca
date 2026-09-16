import type { ExecutionHostId } from './execution-host'

/** Stable board identity. The localhost URL is a lease and is never the restore target. */
export type BacklogBoardBinding = {
  workspaceId: string
  executionHostId: ExecutionHostId
  runtimeEnvironmentId: string | null
}
