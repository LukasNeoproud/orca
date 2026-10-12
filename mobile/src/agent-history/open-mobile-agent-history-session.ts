import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import type { RpcClient } from '../transport/rpc-client'
import type { Worktree } from '../worktree/workspace-list-types'
import {
  buildMobileAiVaultResumeLaunch,
  resolveMobileAiVaultResumePlatform,
  resumeAiVaultSessionInTerminal,
  type MobileAiVaultResumeMutationRegistry
} from '../session/ai-vault-resume-launch'
import { prepareMobileAiVaultSessionResume } from '../session/ai-vault-resume-preparation'
import {
  createMobileStructuredAgentSession,
  revealMobileStructuredAgentSession
} from '../session/mobile-structured-agent-session-launch'
import { resolveMobileAiVaultSessionResumeTarget } from './agent-history-resume-target'
import { loadMobileResumeMetadata } from './mobile-agent-history-resume-metadata'
import { resolveMobileAgentHistoryOpenPlan } from './agent-history-open-plan'

export type MobileAgentHistoryOpenOutcome =
  | { kind: 'opened'; message: string; worktreeId: string }
  | { kind: 'blocked'; message: string }

type MobileAgentHistoryOpenArgs = {
  client: RpcClient
  session: AiVaultSession
  hostCapabilities: readonly string[]
  hostPlatform: NodeJS.Platform | null
  /** The terminal resume's capability-gated fields; absent on hosts that predate them. */
  resumeHostCapabilities?: readonly string[]
  hostTerminalWindowsShell: string | null
  activeWorktreeId: string
  worktrees: readonly Worktree[]
  terminalMutationRegistry: MobileAiVaultResumeMutationRegistry
  /** Throws once a newer resume or a route change owns the result. */
  assertCurrentOwner?: () => void
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
  args.assertCurrentOwner?.()
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
  args.assertCurrentOwner?.()
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
  await resumeAiVaultSessionInTerminal(
    args.client,
    target.worktreeId,
    {
      ...launch,
      hostCapabilities: args.resumeHostCapabilities,
      clientMutationId: args.terminalMutationRegistry.claim(args.session.id)
    },
    args.assertCurrentOwner
  )
  args.terminalMutationRegistry.releaseOnSuccess(args.session.id)
  return { kind: 'opened', message: 'Agent session queued.', worktreeId: target.worktreeId }
}
