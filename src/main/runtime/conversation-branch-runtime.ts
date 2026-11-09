// Where the RPC layer finds the branch service, and how the structured runtime builds it from the
// SAME Claude binary, env and auth policy its chats launch with.

import { homedir } from 'node:os'
import { join } from 'node:path'
import { requireLegacyAgentSessionAccountHome } from '../../shared/agent-session-account-home'
import { agentSessionProviderHandleChainHead } from '../../shared/agent-session-provider-handle'
import { getClaudeProfileRouter } from '../claude-accounts/claude-profile-installed-router'
import { forkClaudeConversationCompacted } from '../claude/claude-conversation-compact-fork'
import { forkClaudeConversationInWorker } from '../claude/claude-conversation-fork-worker'
import { claudeConfigDirEnvPatch, defaultClaudeConfigDir } from '../claude/claude-config-dir-pin'
import { claudeSessionIdForOrcaSession } from '../claude/claude-structured-session-id'
import { resolveClaudeStructuredInvocation } from '../claude/claude-structured-launch-resolution'
import type { StructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-host'
import { resolveSessionFilePath } from '../native-chat/session-file-resolver'
import {
  ConversationBranchService,
  type ConversationBranchTranscript
} from './conversation-branch-service'
import { ConversationBranchStore } from './conversation-branch-store'
import { claudeLaunchEnvOverlay } from './structured-agent-model-catalog-discovery'
import type { StructuredAgentAdapterContext } from './structured-agent-runtime-registrations'

let service: ConversationBranchService | null = null

export function getConversationBranchService(): ConversationBranchService | null {
  return service
}

export function setConversationBranchService(next: ConversationBranchService | null): void {
  service = next
}

function accountHomeCandidates(preferred?: string): string[] {
  const homes = [
    ...(preferred ? [preferred] : []),
    defaultClaudeConfigDir(),
    join(homedir(), '.claude'),
    ...(getClaudeProfileRouter()?.accountHomes() ?? [])
  ]
  return [...new Set(homes)]
}

async function findClaudeTranscript(
  providerSessionId: string,
  preferredAccountHomePath?: string
): Promise<ConversationBranchTranscript | null> {
  for (const accountHomePath of accountHomeCandidates(preferredAccountHomePath)) {
    const path = await resolveSessionFilePath('claude', providerSessionId, {
      claudeProjectsDir: join(accountHomePath, 'projects')
    })
    if (path) {
      return { path, accountHomePath }
    }
  }
  return null
}

/** Built with the structured runtime's host, from that runtime's own launch resolvers. */
export function installConversationBranchService(
  context: Pick<StructuredAgentAdapterContext, 'deps' | 'store' | 'environment'>,
  host: StructuredAgentSessionHost
): void {
  setConversationBranchService(createConversationBranchService(context, host))
}

function createConversationBranchService(
  {
    deps,
    store,
    environment
  }: Pick<StructuredAgentAdapterContext, 'deps' | 'store' | 'environment'>,
  host: StructuredAgentSessionHost
): ConversationBranchService {
  const claudeRecord = (sessionId: string) => {
    const record = store.getRecord(sessionId)
    return record?.provider === 'claude' ? record : null
  }
  return new ConversationBranchService({
    hostId: deps.hostId,
    store: new ConversationBranchStore(deps.stateDirectory, deps.logger),
    resolveWorkspacePath: deps.resolveWorkspacePath,
    readChat: (sessionId) => {
      const record = claudeRecord(sessionId)
      if (!record) {
        return null
      }
      const status = host.readStatusSummary(sessionId)?.status
      return {
        workspaceId: record.location.workspaceId,
        accountHomePath: requireLegacyAgentSessionAccountHome(record.accountHome).path,
        busy: status === 'working' || status === 'attention'
      }
    },
    readChatJournal: (sessionId) => host.journalSnapshot(sessionId),
    chatProviderSessionId: (sessionId) => {
      const record = claudeRecord(sessionId)
      if (!record) {
        return null
      }
      return (
        agentSessionProviderHandleChainHead(record.providerHandleChain)?.handle.nativeId ??
        claudeSessionIdForOrcaSession(sessionId)
      )
    },
    listChatSessionIds: (workspaceId) =>
      store
        .listRecords()
        .filter(
          (record) => record.provider === 'claude' && record.location.workspaceId === workspaceId
        )
        .map((record) => record.sessionId),
    findTranscript: findClaudeTranscript,
    forkFull: forkClaudeConversationInWorker,
    forkCompacted: async (fork, accountHomePath) => {
      const { command, env } = await resolveClaudeStructuredInvocation(
        {
          resolveInheritedEnv: environment.resolveBaseEnvironment,
          resolveAuthPolicy: deps.resolveClaudeAuthPolicy,
          ...(deps.resolveClaudeCommand ? { resolveCommand: deps.resolveClaudeCommand } : {}),
          ...claudeLaunchEnvOverlay(deps)
        },
        (base) => ({ ...base, ...claudeConfigDirEnvPatch(accountHomePath, { env: base }) })
      )
      await forkClaudeConversationCompacted({
        ...fork,
        command,
        env,
        ...(deps.openClaudeConnection ? { openConnection: deps.openClaudeConnection } : {})
      })
    }
  })
}
