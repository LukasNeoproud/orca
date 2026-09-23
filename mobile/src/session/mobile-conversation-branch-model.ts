import type {
  AgentSessionBranchPrepareParams,
  AgentSessionBranchPreviewResult,
  AgentSessionBranchRecord,
  AgentSessionBranchRelationKind
} from '../../../src/shared/agent-session-branch'
import { parseAgentJournalItemKey } from '../../../src/shared/agent-session-journal-item-key'
import type { AgentJournalRenderItem } from '../../../src/shared/agent-session-journal-types'
import {
  createStructuredAgentSessionId,
  structuredAgentSessionCreateParams
} from '../../../src/shared/structured-agent-session-create'
import { structuredSessionRandomUuid } from './mobile-structured-agent-session-rpc'

export type MobileConversationBranchMode = 'preserve-history' | 'targeted'

export type MobileConversationBranchWorkspace = {
  id: string
  label: string
  kind: 'git-worktree' | 'folder'
}

export type MobileConversationBranchDraft = {
  title: string
  relationKind: AgentSessionBranchRelationKind
  targetWorkspaceId: string
  mode: MobileConversationBranchMode
  instruction: string
  content: string
}

export function mobileConversationBranchableItemIds(
  items: readonly AgentJournalRenderItem[]
): ReadonlySet<string> {
  if (
    items.some(
      (item) => item.body.kind === 'status' && item.body.turnLifecycle?.state === 'running'
    )
  ) {
    return new Set()
  }
  const result = new Set<string>()
  items.forEach((item, index) => {
    if (item.body.kind !== 'message' || item.body.role !== 'assistant') {
      return
    }
    const identity = parseAgentJournalItemKey(item.itemId)
    if (!identity || (identity.provider !== 'claude' && identity.provider !== 'codex')) {
      return
    }
    if (
      identity.provider === 'codex' &&
      items.slice(index + 1).some((laterItem) => {
        const later = parseAgentJournalItemKey(laterItem.itemId)
        return (
          later?.provider === 'codex' &&
          later.threadId === identity.threadId &&
          later.turnId === identity.turnId
        )
      })
    ) {
      return
    }
    result.add(item.itemId)
  })
  return result
}

export function targetedMobileConversationHandoff(responseText: string): string {
  return [
    '## Purpose and scope',
    'Address this response as a separate, independently verifiable task. Keep unrelated work outside this thread.',
    '## Explicit requirements and constraints',
    'Follow the existing project instructions and permissions. Do not assume permission to change unrelated code.',
    '## Source passage — agent response, not independently verified',
    responseText,
    '## Expected verification',
    'Report the outcome, relevant artifacts, checks actually performed, and remaining uncertainty.'
  ].join('\n\n')
}

export function initialMobileConversationBranchDraft(args: {
  responseText: string
  sourceWorkspaceId: string
  preview: AgentSessionBranchPreviewResult
}): MobileConversationBranchDraft {
  const firstLine = args.responseText.trim().split('\n')[0]?.trim()
  const preserve = args.preview.nativeProviderForkSupported && !!args.preview.historyPreviewSha256
  return {
    title: firstLine?.slice(0, 100) || 'Related discussion',
    relationKind: 'discussion',
    targetWorkspaceId: args.sourceWorkspaceId,
    mode: preserve ? 'preserve-history' : 'targeted',
    instruction: 'Continue this response as a separate task.',
    content: targetedMobileConversationHandoff(args.responseText)
  }
}

export function buildMobileConversationBranchIntent(args: {
  sourceSessionId: string
  epoch: string
  sourceItemId: string
  preview: AgentSessionBranchPreviewResult
  draft: MobileConversationBranchDraft
}): AgentSessionBranchPrepareParams {
  const { draft, preview } = args
  if (draft.mode === 'preserve-history' && !preview.historyPreviewSha256) {
    throw new Error('Historical context is unavailable. Use a targeted handoff.')
  }
  const sessionId = createStructuredAgentSessionId(preview.sourceAgent, structuredSessionRandomUuid)
  return {
    branchId: structuredSessionRandomUuid(),
    title: draft.title.trim(),
    sourceSessionId: args.sourceSessionId,
    expectedEpoch: args.epoch,
    sourceItemId: args.sourceItemId,
    relationKind: draft.relationKind,
    target: {
      create: structuredAgentSessionCreateParams({
        sessionId,
        worktree: `id:${draft.targetWorkspaceId}`,
        agent: preview.sourceAgent,
        randomUuid: structuredSessionRandomUuid
      })
    },
    handoff:
      draft.mode === 'preserve-history'
        ? {
            mode: 'preserve-history',
            instruction: draft.instruction.trim(),
            historyPreviewSha256: preview.historyPreviewSha256!
          }
        : {
            mode: 'targeted',
            content: draft.content.trim(),
            sourceItemIds: [args.sourceItemId]
          }
  }
}

export function mobileConversationBranchDraftFromIntent(
  intent: AgentSessionBranchPrepareParams
): MobileConversationBranchDraft {
  return {
    title: intent.title,
    relationKind: intent.relationKind,
    targetWorkspaceId: intent.target.create.worktree.replace(/^id:/, ''),
    mode: intent.handoff.mode,
    instruction: intent.handoff.mode === 'preserve-history' ? intent.handoff.instruction : '',
    content: intent.handoff.mode === 'targeted' ? intent.handoff.content : ''
  }
}

export function mobileConversationBranchStateLabel(branch: AgentSessionBranchRecord): string {
  if (branch.state === 'prepared') {
    return 'Prepared. Work has not started.'
  }
  if (branch.state === 'started' || branch.delivery?.status === 'accepted') {
    return 'Started. The related conversation accepted the handoff.'
  }
  if (branch.state === 'fork-unverified' || branch.state === 'forking') {
    return 'Preparation is unconfirmed. Open the related conversation before trying again.'
  }
  if (branch.state === 'preparing') {
    return 'Preparation has not finished. Check this saved relationship before trying again.'
  }
  if (branch.state === 'delivery-unverified' || branch.delivery?.status === 'unknown') {
    return 'Delivery is unconfirmed. Inspect the related conversation before retrying.'
  }
  return branch.error || 'The related conversation could not be prepared.'
}
