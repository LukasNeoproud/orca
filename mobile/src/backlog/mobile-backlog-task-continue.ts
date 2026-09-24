import type { AiVaultListResult, AiVaultSession } from '../../../src/shared/ai-vault-types'
import type { BacklogTaskAssociation } from '../../../src/shared/backlog-task-association'
import { parseExecutionHostId } from '../../../src/shared/execution-host'
import {
  createMobileAiVaultResumeMutationRegistry,
  readMobileRuntimeTerminalWindowsShell
} from '../session/ai-vault-resume-launch'
import { activateMobileSessionTab } from '../session/mobile-session-tab-activation'
import { revealMobileStructuredAgentSession } from '../session/mobile-structured-agent-session-launch'
import { readMobileAgentHistoryHostCapabilities } from '../agent-history/agent-history-open-plan'
import { openMobileAgentHistorySession } from '../agent-history/open-mobile-agent-history-session'
import { readMobileRuntimeHostPlatform } from '../transport/mobile-runtime-host-platform'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'
import { readMobileBacklogTaskAssociation } from './mobile-backlog-task-association-client'
import {
  loadMobileBacklogConversations,
  loadMobileBacklogWorkspaces
} from './mobile-backlog-task-catalog'
import type { MobileBacklogConversationOption } from './mobile-backlog-task-options'

export type MobileBacklogTaskContinueOutcome = {
  association: BacklogTaskAssociation
  status: 'activated' | 'restored' | 'unverifiable' | 'unavailable'
  message: string
  worktreeId: string
}

const resumeRegistries = new WeakMap<
  RpcClient,
  ReturnType<typeof createMobileAiVaultResumeMutationRegistry>
>()

export async function continueMobileBacklogTask(args: {
  client: RpcClient
  sourceWorkspaceId: string
  association: BacklogTaskAssociation
}): Promise<MobileBacklogTaskContinueOutcome> {
  let current: BacklogTaskAssociation | null
  try {
    current = await readMobileBacklogTaskAssociation(
      args.client,
      args.sourceWorkspaceId,
      args.association.taskId
    )
  } catch {
    return result(args.association, 'unverifiable', ownershipMessage())
  }
  if (!current || current.attemptId !== args.association.attemptId) {
    return result(
      args.association,
      'unavailable',
      'The linked conversation changed or is no longer available.'
    )
  }
  let workspaces
  try {
    workspaces = await loadMobileBacklogWorkspaces(args.client, args.sourceWorkspaceId)
  } catch {
    return result(current, 'unverifiable', ownershipMessage())
  }
  const target = workspaces.find(
    (workspace) => workspace.worktreeId === current.targetWorkspace.workspaceId
  )
  if (!target) {
    return result(current, 'unavailable', 'The linked workspace is no longer available.')
  }
  let conversations
  try {
    conversations = await loadMobileBacklogConversations(args.client, target.worktreeId)
  } catch {
    return result(current, 'unverifiable', ownershipMessage())
  }
  const active = conversations.find((conversation) => {
    if (current.session.structuredSessionId) {
      return conversation.session.structuredSessionId === current.session.structuredSessionId
    }
    if (!current.terminal || conversation.terminal?.tabId !== current.terminal.tabId) {
      return false
    }
    const expectedProvider = current.session.providerSession?.id
    return !expectedProvider || conversation.session.providerSession?.id === expectedProvider
  })
  if (active) {
    const activated =
      active.surface === 'structured'
        ? await revealStructured(args.client, active.session.structuredSessionId!)
        : await activateTerminal(args.client, target.worktreeId, active.terminal!)
    return activated
      ? result(current, 'activated', 'Linked conversation opened.')
      : result(current, 'unverifiable', ownershipMessage())
  }
  if (parseExecutionHostId(current.executionHostId)?.kind === 'ssh') {
    return result(current, 'unverifiable', ownershipMessage())
  }
  const providerSession = current.session.providerSession
  if (!providerSession) {
    return result(current, 'unavailable', 'The linked conversation is no longer available.')
  }
  try {
    const [statusResponse, historyResponse] = await Promise.all([
      args.client.sendRequest('status.get', undefined, {
        timeoutMs: 15_000,
        budgetSpansConnect: true
      }),
      args.client.sendRequest(
        'aiVault.listSessions',
        { unlimited: true, force: true, scopePaths: [target.path] },
        { timeoutMs: 30_000, budgetSpansConnect: true }
      )
    ])
    if (!statusResponse.ok || !historyResponse.ok) {
      return result(current, 'unverifiable', ownershipMessage())
    }
    const sessions = ((historyResponse as RpcSuccess).result as AiVaultListResult).sessions
    const session = sessions.find((candidate) => associationMatchesSession(current!, candidate))
    if (!session) {
      return result(current, 'unavailable', 'The linked conversation history is unavailable.')
    }
    const hostStatus = (statusResponse as RpcSuccess).result
    const opened = await openMobileAgentHistorySession({
      client: args.client,
      session,
      hostCapabilities: readMobileAgentHistoryHostCapabilities(hostStatus),
      hostPlatform: readMobileRuntimeHostPlatform(hostStatus),
      hostTerminalWindowsShell: readMobileRuntimeTerminalWindowsShell(hostStatus),
      activeWorktreeId: target.worktreeId,
      worktrees: workspaces,
      terminalMutationRegistry: resumeRegistry(args.client)
    })
    if (opened.kind === 'blocked') {
      return result(
        current,
        opened.message.toLowerCase().includes('verify') ? 'unverifiable' : 'unavailable',
        opened.message
      )
    }
    return result(current, 'restored', opened.message)
  } catch {
    return result(current, 'unverifiable', ownershipMessage())
  }
}

function associationMatchesSession(
  association: BacklogTaskAssociation,
  session: AiVaultSession
): boolean {
  const expected = association.session.providerSession
  return (
    Boolean(expected) &&
    session.sessionId === expected!.id &&
    (!association.session.agent || session.agent === association.session.agent) &&
    (!association.session.history?.filePath ||
      session.filePath === association.session.history.filePath) &&
    (!association.session.history?.codexHome ||
      session.codexHome === association.session.history.codexHome)
  )
}

async function revealStructured(
  client: Pick<RpcClient, 'sendRequest'>,
  sessionId: string
): Promise<boolean> {
  try {
    await revealMobileStructuredAgentSession(client, sessionId)
    return true
  } catch {
    return false
  }
}

async function activateTerminal(
  client: Pick<RpcClient, 'sendRequest'>,
  worktreeId: string,
  terminal: NonNullable<MobileBacklogConversationOption['terminal']>
): Promise<boolean> {
  try {
    const response = await activateMobileSessionTab(client, {
      worktree: `id:${worktreeId}`,
      tabId: terminal.tabId,
      ...(terminal.leafId ? { leafId: terminal.leafId } : {}),
      notifyClients: false,
      navigation: 'caller',
      intent: 'user'
    })
    return response.ok
  } catch {
    return false
  }
}

function resumeRegistry(client: RpcClient) {
  let registry = resumeRegistries.get(client)
  if (!registry) {
    registry = createMobileAiVaultResumeMutationRegistry(
      (sessionId) =>
        `backlog-resume:${sessionId.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 64)}:${Date.now().toString(36)}`
    )
    resumeRegistries.set(client, registry)
  }
  return registry
}

function result(
  association: BacklogTaskAssociation,
  status: MobileBacklogTaskContinueOutcome['status'],
  message: string
): MobileBacklogTaskContinueOutcome {
  return { association, status, message, worktreeId: association.targetWorkspace.workspaceId }
}

function ownershipMessage(): string {
  return 'Conversation ownership is unverifiable. Reconnect the execution host before continuing.'
}
