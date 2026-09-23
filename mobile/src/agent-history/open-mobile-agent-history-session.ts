import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import type { RpcResponse } from '../transport/types'
import type { RpcClient } from '../transport/rpc-client'
import type { Worktree } from '../worktree/workspace-list-types'
import {
  buildMobileAiVaultResumeLaunch,
  resolveMobileAiVaultResumePlatform,
  resumeAiVaultSessionInTerminal,
  type MobileAiVaultResumeMutationRegistry,
  type MobileAiVaultResumeSettings
} from '../session/ai-vault-resume-launch'
import {
  prepareMobileAiVaultSessionResume,
  RESUME_RPC_TIMEOUT_MS
} from '../session/ai-vault-resume-preparation'
import {
  createMobileStructuredAgentSession,
  revealMobileStructuredAgentSession
} from '../session/mobile-structured-agent-session-launch'
import {
  resolveMobileAiVaultSessionResumeTarget,
  type MobileAiVaultResumeFolderWorkspace,
  type MobileAiVaultResumeProjectGroup,
  type MobileAiVaultResumeRepo
} from './agent-history-resume-target'
import { resolveMobileAgentHistoryOpenPlan } from './agent-history-open-plan'

export type MobileAgentHistoryOpenOutcome =
  | { kind: 'opened'; message: string; worktreeId: string }
  | { kind: 'blocked'; message: string }

type MobileAgentHistoryOpenArgs = {
  client: RpcClient
  session: AiVaultSession
  hostCapabilities: readonly string[]
  hostPlatform: NodeJS.Platform | null
  hostTerminalWindowsShell: string | null
  activeWorktreeId: string
  worktrees: readonly Worktree[]
  terminalMutationRegistry: MobileAiVaultResumeMutationRegistry
}

const opensInFlight = new WeakMap<RpcClient, Map<string, Promise<MobileAgentHistoryOpenOutcome>>>()

export function openMobileAgentHistorySession(
  args: MobileAgentHistoryOpenArgs
): Promise<MobileAgentHistoryOpenOutcome> {
  const identity = JSON.stringify([
    args.session.executionHostId,
    args.session.agent,
    args.session.sessionId,
    args.session.codexHome ?? null
  ])
  const clientOpens = opensInFlight.get(args.client) ?? new Map()
  opensInFlight.set(args.client, clientOpens)
  const existing = clientOpens.get(identity)
  if (existing) {
    return existing
  }
  const open = runMobileAgentHistoryOpen(args)
  clientOpens.set(identity, open)
  const cleanup = (): void => {
    if (clientOpens.get(identity) === open) {
      clientOpens.delete(identity)
    }
  }
  void open.then(cleanup, cleanup)
  return open
}

async function runMobileAgentHistoryOpen(
  args: MobileAgentHistoryOpenArgs
): Promise<MobileAgentHistoryOpenOutcome> {
  const plan = resolveMobileAgentHistoryOpenPlan(args.session, args.hostCapabilities)
  if (plan.kind === 'blocked') {
    return plan
  }
  if (plan.kind === 'reveal') {
    await revealMobileStructuredAgentSession(args.client, plan.sessionId)
    return { kind: 'opened', message: 'Chat opened.', worktreeId: plan.worktreeId }
  }
  if (!args.session.sessionId) {
    return { kind: 'blocked', message: 'This session is missing a resume id.' }
  }

  const metadata = await loadMobileResumeMetadata(args.client)
  const target = resolveMobileAiVaultSessionResumeTarget({
    session: args.session,
    activeWorktreeId: args.activeWorktreeId,
    worktrees: metadata.worktrees ?? args.worktrees,
    repos: metadata.repos,
    folderWorkspaces: metadata.folderWorkspaces,
    projectGroups: metadata.projectGroups
  })
  if (target.status !== 'ready') {
    return { kind: 'blocked', message: target.message }
  }

  const prepared = await prepareMobileAiVaultSessionResume(args.client, args.session)
  if (plan.kind === 'structured-resume') {
    const result = await createMobileStructuredAgentSession(
      args.client,
      target.worktreeId,
      plan.agent,
      { resumeFrom: { providerSessionId: prepared.sessionId } }
    )
    if (result.kind !== 'created') {
      return {
        kind: 'blocked',
        message:
          result.kind === 'unsupported'
            ? 'Structured chat resume is not available for this workspace.'
            : result.message
      }
    }
    return { kind: 'opened', message: 'Chat opened.', worktreeId: target.worktreeId }
  }

  const platform = resolveMobileAiVaultResumePlatform(
    target.targetStatus,
    args.hostPlatform,
    target.workspacePath,
    target.terminalPlatform
  )
  if (!platform) {
    return { kind: 'blocked', message: 'Unable to determine host platform.' }
  }
  const launch = buildMobileAiVaultResumeLaunch({
    session: prepared,
    hostPlatform: platform,
    hostTerminalWindowsShell: args.hostTerminalWindowsShell,
    settings: metadata.settings
  })
  await resumeAiVaultSessionInTerminal(args.client, target.worktreeId, {
    ...launch,
    clientMutationId: args.terminalMutationRegistry.claim(args.session.id)
  })
  args.terminalMutationRegistry.releaseOnSuccess(args.session.id)
  return { kind: 'opened', message: 'Agent session queued.', worktreeId: target.worktreeId }
}

export async function loadMobileResumeMetadata(client: Pick<RpcClient, 'sendRequest'>): Promise<{
  repos: MobileAiVaultResumeRepo[]
  folderWorkspaces: MobileAiVaultResumeFolderWorkspace[]
  projectGroups: MobileAiVaultResumeProjectGroup[]
  settings: MobileAiVaultResumeSettings | null
  worktrees: Worktree[] | null
}> {
  const [repos, folders, groups, settings, worktrees] = await Promise.all([
    client.sendRequest('repo.list', undefined, { timeoutMs: RESUME_RPC_TIMEOUT_MS }),
    optionalResumeMetadata(client, 'folderWorkspace.list'),
    optionalResumeMetadata(client, 'projectGroup.list'),
    optionalResumeMetadata(client, 'settings.get'),
    optionalResumeMetadata(client, 'worktree.ps', { limit: 10000 })
  ])
  if (!repos.ok) {
    throw new Error(repos.error?.message || 'Unable to load workspace metadata.')
  }
  return {
    repos: (repos.result as { repos?: MobileAiVaultResumeRepo[] }).repos ?? [],
    folderWorkspaces:
      readOptionalResult<{ folderWorkspaces?: MobileAiVaultResumeFolderWorkspace[] }>(folders)
        ?.folderWorkspaces ?? [],
    projectGroups:
      readOptionalResult<{ groups?: MobileAiVaultResumeProjectGroup[] }>(groups)?.groups ?? [],
    settings:
      readOptionalResult<{ settings?: MobileAiVaultResumeSettings }>(settings)?.settings ?? null,
    worktrees: readOptionalResult<{ worktrees?: Worktree[] }>(worktrees)?.worktrees ?? null
  }
}

async function optionalResumeMetadata(
  client: Pick<RpcClient, 'sendRequest'>,
  method: string,
  params?: unknown
): Promise<RpcResponse | null> {
  return client.sendRequest(method, params, { timeoutMs: RESUME_RPC_TIMEOUT_MS }).catch(() => null)
}

function readOptionalResult<T>(response: RpcResponse | null): T | null {
  return response?.ok === true ? (response.result as T) : null
}
