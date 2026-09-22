import { join } from 'node:path'
import { parseAgentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import type { StructuredAgentSessionAdapter } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import { resolveSessionFilePath } from '../native-chat/session-file-resolver'
import { claudeConfigDirEnvPatch } from './claude-config-dir-pin'
import { openClaudeStreamJsonConnection } from './claude-stream-json-connection'
import { readClaudeInit } from './claude-structured-init-proof'
import { claudeSessionIdForOrcaSession } from './claude-structured-launch-resolution'
import type {
  ClaudeSession,
  ClaudeStructuredSessionAdapterDeps
} from './claude-structured-session-state'
import { resolveClaudeTranscriptForkBoundary } from './claude-transcript-fork-boundary'

export async function forkClaudeStructuredConversation(input: {
  request: Parameters<NonNullable<StructuredAgentSessionAdapter['forkConversation']>>[0]
  source: Pick<ClaudeSession, 'claudeConfigDir' | 'leafUuid' | 'providerSessionId'>
  deps: Pick<
    ClaudeStructuredSessionAdapterDeps,
    'initTimeoutMs' | 'openConnection' | 'resolveLaunch' | 'resolveWorkspacePath'
  >
}): Promise<{ providerSessionId: string }> {
  const selected = parseAgentJournalItemKey(input.request.boundaryItemId)
  if (
    selected?.provider !== 'claude' ||
    selected.sessionId !== input.source.providerSessionId ||
    !input.source.leafUuid ||
    !input.deps.resolveWorkspacePath
  ) {
    throw new Error('agent_session_branch_invalid_anchor')
  }
  const transcriptPath = await resolveSessionFilePath('claude', input.source.providerSessionId, {
    claudeProjectsDir: join(input.source.claudeConfigDir, 'projects')
  })
  if (!transcriptPath) {
    throw new Error('agent_session_branch_provider_history_missing')
  }
  const boundary = await resolveClaudeTranscriptForkBoundary({
    transcriptPath,
    providerSessionId: input.source.providerSessionId,
    selectedUuid: selected.uuid,
    leafUuid: input.source.leafUuid
  })
  const targetProviderSessionId = claudeSessionIdForOrcaSession(input.request.targetSessionId)
  const launch = await input.deps.resolveLaunch({
    identity: {
      sessionId: input.request.sourceSessionId,
      workspaceId: input.request.targetLocation.workspaceId,
      hostId: input.request.targetLocation.executionHostId,
      agent: 'claude',
      providerHandle: {
        kind: 'claude',
        sessionId: input.source.providerSessionId,
        leafUuid: input.source.leafUuid
      }
    }
  })
  let observedProviderSessionId: string | null = null
  const open = input.deps.openConnection ?? openClaudeStreamJsonConnection
  const connection = await open(
    {
      pathToClaudeCodeExecutable: launch.pathToClaudeCodeExecutable,
      options: {
        ...launch.options,
        resume: input.source.providerSessionId,
        resumeSessionAt: boundary,
        forkSession: true,
        sessionId: targetProviderSessionId
      },
      cwd: await input.deps.resolveWorkspacePath(input.request.targetLocation.workspaceId),
      env: {
        ...launch.env,
        ...claudeConfigDirEnvPatch(input.source.claudeConfigDir, { env: launch.env })
      }
    },
    {
      onMessage: (message) => {
        observedProviderSessionId ??= readClaudeInit(message)?.providerSessionId ?? null
      }
    }
  )
  let initializationError: unknown = null
  try {
    await connection.initializationResult({ timeoutMs: input.deps.initTimeoutMs })
    if (observedProviderSessionId !== targetProviderSessionId) {
      throw new Error('agent_session_branch_provider_identity_missing')
    }
  } catch (error) {
    initializationError = error
  }
  if (!(await connection.close())) {
    throw new Error('agent_session_branch_provider_exit_unverified')
  }
  if (initializationError) {
    throw initializationError
  }
  return { providerSessionId: targetProviderSessionId }
}
