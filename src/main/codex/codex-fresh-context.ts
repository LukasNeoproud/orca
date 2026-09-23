import type { CodexAppServerConnection } from './codex-app-server-connection'
import { readCodexThreadId, readCodexThreadPath } from './codex-structured-thread-facts'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('agent_context_configuration_unavailable')
  }
  return value as Record<string, unknown>
}

/** Preserve the provider's effective permission boundary, including custom writable roots. */
export function codexFreshContextParameters(forkResponse: unknown, cwd: string) {
  const source = object(forkResponse)
  const policy = object(source.sandbox)
  const config: Record<string, unknown> = {}
  let sandbox: string
  if (policy.type === 'dangerFullAccess') {
    sandbox = 'danger-full-access'
  } else if (policy.type === 'readOnly' && policy.networkAccess === false) {
    sandbox = 'read-only'
  } else if (
    policy.type === 'workspaceWrite' &&
    Array.isArray(policy.writableRoots) &&
    policy.writableRoots.every((root) => typeof root === 'string') &&
    typeof policy.networkAccess === 'boolean' &&
    typeof policy.excludeTmpdirEnvVar === 'boolean' &&
    typeof policy.excludeSlashTmp === 'boolean'
  ) {
    sandbox = 'workspace-write'
    config.sandbox_workspace_write = {
      writable_roots: policy.writableRoots,
      network_access: policy.networkAccess,
      exclude_tmpdir_env_var: policy.excludeTmpdirEnvVar,
      exclude_slash_tmp: policy.excludeSlashTmp
    }
  } else {
    throw new Error('agent_context_permissions_unsupported')
  }
  const profile = source.activePermissionProfile
  if (
    profile &&
    ![':read-only', ':workspace', ':danger-full-access'].includes(String(object(profile).id))
  ) {
    throw new Error('agent_context_permissions_unsupported')
  }
  if (typeof source.model !== 'string' || source.approvalPolicy == null) {
    throw new Error('agent_context_configuration_unavailable')
  }
  if (source.reasoningEffort != null) {
    config.model_reasoning_effort = source.reasoningEffort
  }
  return {
    cwd,
    model: source.model,
    modelProvider: source.modelProvider,
    approvalPolicy: source.approvalPolicy,
    approvalsReviewer: source.approvalsReviewer,
    serviceTier: source.serviceTier,
    runtimeWorkspaceRoots: source.runtimeWorkspaceRoots,
    sandbox,
    config
  }
}

export async function createCodexFreshContext(input: {
  connection: Pick<CodexAppServerConnection, 'request'>
  sourceThreadId: string
  lastTurnId: string
  cwd: string
  handoff: string
  baseInstructions?: string
  timeoutMs: number
  onCreated: (threadId: string, transcriptPath: string | null) => Promise<void>
}): Promise<{ threadId: string; transcriptPath: string | null }> {
  // An ephemeral fork reads effective source configuration without opening a second source writer.
  const fork = await input.connection.request(
    'thread/fork',
    {
      threadId: input.sourceThreadId,
      lastTurnId: input.lastTurnId,
      cwd: input.cwd,
      ephemeral: true,
      excludeTurns: true
    },
    { timeoutMs: input.timeoutMs }
  )
  const started = await input.connection.request(
    'thread/start',
    {
      ...codexFreshContextParameters(fork, input.cwd),
      ...(input.baseInstructions ? { baseInstructions: input.baseInstructions } : {})
    },
    { timeoutMs: input.timeoutMs }
  )
  const threadId = readCodexThreadId(started)
  if (!threadId || threadId === input.sourceThreadId || threadId === readCodexThreadId(fork)) {
    throw new Error('agent_context_fresh_identity_missing')
  }
  const transcriptPath = readCodexThreadPath(started)
  await input.onCreated(threadId, transcriptPath)
  await input.connection.request(
    'thread/inject_items',
    {
      threadId,
      items: [
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: input.handoff }] }
      ]
    },
    { timeoutMs: input.timeoutMs }
  )
  return { threadId, transcriptPath }
}
