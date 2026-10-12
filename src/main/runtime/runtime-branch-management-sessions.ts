import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import { worktreeIdsEqual } from '../../shared/worktree/id'
import { parsePtySessionId } from '../../shared/pty-session-id-format'
import { LOCAL_EXECUTION_HOST_ID, normalizeExecutionHostId } from '../../shared/execution-host'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'
import { observeStructuredWorker } from './structured-worker-authority'
import type { RuntimePtyController } from './runtime-pty-controller-contract'
import type { RuntimeGitTarget } from './runtime-git-command-target'

export async function getBranchManagementSessions(
  controller: Pick<RuntimePtyController, 'listProcesses'> | null | undefined,
  target: RuntimeGitTarget
): Promise<string[] | null> {
  if (!controller?.listProcesses) {
    return null
  }
  try {
    const processes = await controller.listProcesses(
      normalizeExecutionHostId(target.executionHostId) ?? LOCAL_EXECUTION_HOST_ID,
      {
        deadlineMs: Date.now() + 10000,
        includeForegroundProcessEvidence: true
      }
    )
    const sessions = processes
      .filter((process) => {
        const owner = process.worktreeId ?? parsePtySessionId(process.id).worktreeId
        return owner
          ? worktreeIdsEqual(owner, target.worktree.id)
          : isPathInsideOrEqual(target.worktree.path, process.cwd)
      })
      .filter(
        (process) =>
          process.agentSessionOwners?.length ||
          process.foregroundProcessEvidence?.verdict !== 'live' ||
          process.foregroundProcessEvidence.shellOwnsEveryTtyProcessGroup !== true
      )
      .map((process) =>
        process.agentSessionOwners?.length
          ? process.title || 'Agent session'
          : `unverifiable: ${process.title || 'Terminal session'}`
      )
    const host = getStructuredAgentSessionHost()
    if (host) {
      for (const record of host.deps.store.listRecords()) {
        if (
          !worktreeIdsEqual(record.location.workspaceId, target.worktree.id) ||
          record.location.executionHostId !== target.executionHostId
        ) {
          continue
        }
        const observation = observeStructuredWorker({ sessionId: record.sessionId })
        if (observation.status !== 'exited') {
          sessions.push(`${observation.status}: ${record.provider}`)
        }
      }
    }
    return sessions
  } catch {
    return null
  }
}
