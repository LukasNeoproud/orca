import { translate } from '@/i18n/i18n'
import type { useAppStore } from '@/store'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { isAiVaultSessionResumableContent } from '../../../../shared/ai-vault-types'
import type { AgentSessionHistoryOpenMode } from '../../../../shared/agent-session-history-open-mode'
import { resolveAgentSessionHistoryOpenMode } from '../../../../shared/agent-session-history-open-mode'
import type { Worktree } from '../../../../shared/worktree/types'
import type { AiVaultResumeInChatBlockedReason } from '../right-sidebar/ai-vault-session-resume-in-chat'
import { resolveAiVaultSessionResumeInChatForWorkspace } from '../right-sidebar/ai-vault-session-resume-in-chat-workspace'
import {
  resolveAiVaultSessionResumeState,
  type AiVaultSessionResumeTargetState
} from '../right-sidebar/ai-vault-session-resume'
import {
  aiVaultResumeUnsupportedMessage,
  resolveAiVaultSessionLaunchTarget
} from '../right-sidebar/ai-vault-session-launch-target'
import type { AiVaultSessionWorktreeInfo } from '../right-sidebar/ai-vault-session-worktree'

function structuredBlockedReason(reason: AiVaultResumeInChatBlockedReason): string {
  switch (reason) {
    case 'agent':
      return translate(
        'auto.components.sidebar.WorktreeConversationHistory.structuredAgentUnsupported',
        'This agent does not support Chat UI.'
      )
    case 'remote':
      return translate(
        'auto.components.sidebar.WorktreeConversationHistory.structuredLocalOnly',
        'Chat UI is available for local sessions only.'
      )
    case 'empty':
      return translate(
        'auto.components.sidebar.WorktreeConversationHistory.emptySessionUnsupported',
        'This session has no saved conversation to open.'
      )
    case 'already-structured':
      return translate(
        'auto.components.sidebar.WorktreeConversationHistory.alreadyOpen',
        'This conversation is already open.'
      )
    case 'workspace':
      return translate(
        'auto.components.sidebar.WorktreeConversationHistory.structuredWorkspaceUnsupported',
        'Chat UI is unavailable in this workspace.'
      )
  }
}

function ownershipBlockedReason(session: AiVaultSession): string | null {
  return session.structuredSession?.ownerState === 'unverifiable'
    ? translate(
        'auto.components.sidebar.WorktreeConversationHistory.ownerUnverifiable',
        'Orca cannot verify whether this conversation is still running.'
      )
    : null
}

export type SessionOpenAvailability = {
  terminalReason: string | null
  structuredReason: string | null
  preferredMode: AgentSessionHistoryOpenMode
  preferredReason: string | null
}

export function getSessionOpenAvailability(args: {
  session: AiVaultSession
  worktree: Worktree
  worktreeInfo: AiVaultSessionWorktreeInfo | null
  targetState: AiVaultSessionResumeTargetState
  settings: ReturnType<typeof useAppStore.getState>['settings']
}): SessionOpenAvailability {
  const preferredMode = resolveAgentSessionHistoryOpenMode(args.settings)
  const ownershipReason = ownershipBlockedReason(args.session)
  if (args.session.structuredSession && !ownershipReason) {
    return { terminalReason: null, structuredReason: null, preferredMode, preferredReason: null }
  }

  const launchTarget = resolveAiVaultSessionLaunchTarget({
    sessionFilePath: args.session.filePath,
    sessionExecutionHostId: args.session.executionHostId,
    activeWorktreeId: args.worktree.id,
    targetWorktreeId: args.worktree.id,
    targetState: args.targetState
  })
  const terminalReason =
    ownershipReason ??
    (!isAiVaultSessionResumableContent(args.session)
      ? translate(
          'auto.components.sidebar.WorktreeConversationHistory.emptySessionUnsupported',
          'This session has no saved conversation to open.'
        )
      : launchTarget.status === 'unsupported'
        ? aiVaultResumeUnsupportedMessage(launchTarget.targetStatus)
        : launchTarget.status === 'missing'
          ? translate(
              'auto.components.sidebar.WorktreeConversationHistory.workspaceUnavailable',
              'This workspace is unavailable.'
            )
          : null)

  const resumeState = resolveAiVaultSessionResumeState({
    sessionFilePath: args.session.filePath,
    sessionExecutionHostId: args.session.executionHostId,
    worktreeInfo: args.worktreeInfo,
    activeWorktreeId: args.worktree.id,
    worktrees: [args.worktree],
    repos: [],
    targetState: args.targetState
  })
  const structuredEligibility = resolveAiVaultSessionResumeInChatForWorkspace({
    session: args.session,
    resumeState,
    activeWorkspaceId: args.worktree.id,
    targetState: args.targetState,
    settings: args.settings
  })
  const structuredReason =
    ownershipReason ??
    (structuredEligibility.available ? null : structuredBlockedReason(structuredEligibility.reason))
  return {
    terminalReason,
    structuredReason,
    preferredMode,
    preferredReason: preferredMode === 'terminal' ? terminalReason : structuredReason
  }
}
