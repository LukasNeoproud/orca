import type {
  AgentSessionExecutionLocation,
  AgentSessionRecord
} from '../../shared/agent-session-record'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type { WorkspaceSessionState } from '../../shared/workspace-session-state-types'
import type { StructuredAgentSessionTerminalAdoptionParams } from '../../shared/structured-agent-session-terminal-adoption'
import type { StructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-host'
import { StructuredTerminalAdoptionError } from '../native-chat/agent-session-wire/structured-agent-session-terminal-adoption'
import type { RuntimePtyController } from './runtime-pty-controller-contract'
import type { RuntimePtyWorktreeRecord } from './runtime-terminal-state-records'
import { adoptStructuredTerminal } from './structured-terminal-adoption'
import { recoverStructuredTerminalAdoption } from './structured-terminal-adoption-recovery'
import { structuredAdoptionAccountHomeCandidates } from './structured-agent-session-create-adoption'
import { getSystemCodexHomePath } from '../codex/codex-home-paths'
import { homedir } from 'node:os'
import { join } from 'node:path'

type RuntimeTerminalAccess = {
  ptysById: ReadonlyMap<string, RuntimePtyWorktreeRecord>
  leaves: ReadonlyMap<string, { tabId: string }>
  ptyController: Pick<RuntimePtyController, 'listProcesses'> | null
  getWorkspaceSessionForWorktree: (id: string) => WorkspaceSessionState | null
  resolveRuntimeFileTarget: (selector: string) => Promise<{ worktree: { path: string } }>
  issueStructuredTuiPtyHandle: (pty: RuntimePtyWorktreeRecord) => string
  getAgentProviderSessionRowsForPaneFn?: ((pane: string) => AgentStatusIpcPayload[]) | null
  getAgentProviderSessionSnapshotFn?: (() => AgentStatusIpcPayload[]) | null
  getAgentStatusSnapshotFn?: (() => AgentStatusIpcPayload[]) | null
}

function providerRows(runtime: RuntimeTerminalAccess, paneKey: string) {
  return [
    ...(runtime.getAgentProviderSessionRowsForPaneFn?.(paneKey) ??
      runtime.getAgentProviderSessionSnapshotFn?.() ??
      []),
    ...(runtime.getAgentStatusSnapshotFn?.() ?? [])
  ]
}

export async function recoverAdoptedRuntimeTerminal(
  runtime: RuntimeTerminalAccess,
  record: AgentSessionRecord
) {
  return recoverStructuredTerminalAdoption({
    record,
    workspacePath: (await runtime.resolveRuntimeFileTarget(`id:${record.location.workspaceId}`))
      .worktree.path,
    readPty: () =>
      record.adoptedTerminal ? runtime.ptysById.get(record.adoptedTerminal.ptyId) : undefined,
    listProcesses: (connectionId) =>
      runtime.ptyController?.listProcesses?.(connectionId) ?? Promise.resolve([]),
    providerRows: () => providerRows(runtime, record.adoptedTerminal?.paneKey ?? ''),
    issueHandle: (pty) => runtime.issueStructuredTuiPtyHandle(pty)
  })
}

export function adoptStructuredRuntimeTerminal(
  input: {
    runtime: RuntimeTerminalAccess
    host: StructuredAgentSessionHost
    location: AgentSessionExecutionLocation
    workspacePath: string
    settings: Parameters<typeof structuredAdoptionAccountHomeCandidates>[0]['settings']
    claudeAccountHome?: string | null
  },
  request: StructuredAgentSessionTerminalAdoptionParams,
  callerKey: string
) {
  const { runtime, location } = input
  return adoptStructuredTerminal(
    {
      runtime,
      host: input.host,
      location,
      workspacePath: input.workspacePath,
      readPty: () => {
        const pty = runtime.ptysById.get(request.terminal.ptyId)
        const root = runtime.getWorkspaceSessionForWorktree(location.workspaceId)
          ?.terminalLayoutsByTabId[request.terminal.tabId]?.root
        const leaves = [...runtime.leaves.values()].filter(
          (leaf) => leaf.tabId === request.terminal.tabId
        )
        if (
          !pty?.connected ||
          pty.connectionId !== null ||
          pty.isWsl ||
          pty.wslDistro ||
          pty.worktreeId !== location.workspaceId ||
          pty.tabId !== request.terminal.tabId ||
          pty.paneKey !== request.terminal.paneKey ||
          root?.type === 'split' ||
          leaves.length > 1
        ) {
          throw new StructuredTerminalAdoptionError(
            'agent_session_identity_required',
            'Switch a single local agent pane to structured chat after its terminal connection is ready.'
          )
        }
        return pty
      },
      issueHandle: (pty) => runtime.issueStructuredTuiPtyHandle(pty),
      listProcesses: (connectionId) =>
        runtime.ptyController?.listProcesses?.(connectionId) ?? Promise.resolve([]),
      providerRows: () => providerRows(runtime, request.terminal.paneKey),
      accountHomes: (pty) => {
        const pinned =
          pty.launchConfig?.agentEnv[request.agent === 'codex' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR']
        return pinned
          ? [pinned]
          : structuredAdoptionAccountHomeCandidates({
              settings: input.settings,
              agent: request.agent,
              selectedAccountHomePath:
                request.agent === 'codex'
                  ? getSystemCodexHomePath()
                  : input.claudeAccountHome?.trim() || join(homedir(), '.claude')
            })
      }
    },
    request,
    callerKey
  )
}
