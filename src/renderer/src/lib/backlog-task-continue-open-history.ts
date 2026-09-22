import type { BacklogTaskAssociation } from '../../../shared/backlog-task-association'
import type { AiVaultSession } from '../../../shared/ai-vault-types'
import type { AiVaultSessionOpenedTarget } from './ai-vault-session-open'
import { saveBacklogTaskAssociation } from './backlog-task-association-client'
import type { BacklogRoute } from './backlog-rpc'
import type { BacklogTaskContinueResult } from './backlog-task-continue'
import type { PairedProviderOwnerVerdict } from './backlog-task-paired-terminal-owner'
import { openWorkspaceConversationHistory } from './workspace-conversation-history'

async function persistRestoredTarget(
  sourceRoute: BacklogRoute,
  association: BacklogTaskAssociation,
  target: AiVaultSessionOpenedTarget,
  restoredTerminal?: BacklogTaskAssociation['terminal']
): Promise<BacklogTaskAssociation> {
  return saveBacklogTaskAssociation(sourceRoute, {
    taskId: association.taskId,
    targetWorkspace: association.targetWorkspace,
    session:
      target.kind === 'structured'
        ? { ...association.session, structuredSessionId: target.sessionId }
        : association.session,
    ...(target.kind === 'terminal'
      ? {
          terminal: restoredTerminal ?? {
            launchAgent: association.terminal?.launchAgent,
            tabId: target.tabId
          }
        }
      : {}),
    attemptId: association.attemptId,
    expectedAttemptId: association.attemptId,
    deliveryStatus: association.deliveryStatus
  })
}

export async function openBacklogTaskHistory(
  sourceRoute: BacklogRoute,
  route: BacklogRoute,
  association: BacklogTaskAssociation,
  session: AiVaultSession,
  pairedOwnerClassifier?: () => Promise<PairedProviderOwnerVerdict>
): Promise<BacklogTaskContinueResult> {
  let currentAssociation = association
  const status = await openWorkspaceConversationHistory(route, session, {
    terminal: association.terminal,
    pairedOwnerClassifier,
    onRestored: async (target, terminal) => {
      currentAssociation = await persistRestoredTarget(sourceRoute, association, target, terminal)
    }
  })
  return { association: currentAssociation, status }
}
