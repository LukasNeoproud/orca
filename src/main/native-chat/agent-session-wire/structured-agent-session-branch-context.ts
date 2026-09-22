import { createHash } from 'node:crypto'
import type {
  AgentSessionBranchPreviewParams,
  AgentSessionBranchPreviewResult
} from '../../../shared/agent-session-branch'
import { formatAgentSessionBranchHistory } from '../../../shared/agent-session-branch-preview'
import type { AgentJournalRenderItem } from '../../../shared/agent-session-journal-types'
import { parseAgentJournalItemKey } from '../../../shared/agent-session-journal-item-key'
import type { StructuredAgentSessionHost } from './structured-agent-session-host'
import { agentSessionProviderHandleChainHead } from '../../../shared/agent-session-provider-handle'

export const AGENT_SESSION_BRANCH_MAX_CONTENT_BYTES = 256 * 1024

export type AgentSessionBranchContext = AgentSessionBranchPreviewResult & {
  excerpt: string
  items: AgentJournalRenderItem[]
  sourceProviderSessionId: string
}

export function agentSessionBranchContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function excerpt(item: AgentJournalRenderItem): string {
  if (item.body.kind !== 'message') {
    return 'Completed response'
  }
  const text = item.body.blocks
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n')
    .trim()
  return text.slice(0, 1_024) || 'Completed response'
}

export async function readAgentSessionBranchContext(
  host: StructuredAgentSessionHost,
  params: AgentSessionBranchPreviewParams,
  options: { allowUserAnchor?: boolean } = {}
): Promise<AgentSessionBranchContext> {
  await host.revealSession(params.sourceSessionId)
  await host.flushStreamedEvents(params.sourceSessionId)
  const record = host.deps.store.getRecord(params.sourceSessionId)
  if (!record) {
    throw new Error('agent_session_branch_source_missing')
  }
  const snapshot = host.journalSnapshot(params.sourceSessionId)
  if (snapshot.cursor.epoch !== params.expectedEpoch) {
    throw new Error('agent_session_branch_source_stale')
  }
  const selected = snapshot.items.findIndex((item) => item.itemId === params.sourceItemId)
  const anchor = selected === -1 ? null : snapshot.items[selected]
  if (
    !anchor ||
    anchor.body.kind !== 'message' ||
    (anchor.body.role !== 'assistant' && !(options.allowUserAnchor && anchor.body.role === 'user'))
  ) {
    throw new Error('agent_session_branch_invalid_anchor')
  }
  const isTargetedUserAnchor = options.allowUserAnchor && anchor.body.role === 'user'
  if (
    !isTargetedUserAnchor &&
    snapshot.items.some(
      (item) => item.body.kind === 'status' && item.body.turnLifecycle?.state === 'running'
    )
  ) {
    throw new Error('agent_session_branch_source_busy')
  }
  const identity = parseAgentJournalItemKey(anchor.itemId)
  if (
    !identity ||
    (anchor.body.role === 'assistant' &&
      identity.provider !== 'claude' &&
      identity.provider !== 'codex')
  ) {
    throw new Error('agent_session_branch_invalid_anchor')
  }
  if (
    !options.allowUserAnchor &&
    anchor.body.role === 'assistant' &&
    identity.provider === 'codex' &&
    snapshot.items.slice(selected + 1).some((item) => {
      const later = parseAgentJournalItemKey(item.itemId)
      return (
        later?.provider === 'codex' &&
        later.threadId === identity.threadId &&
        later.turnId === identity.turnId
      )
    })
  ) {
    throw new Error('agent_session_branch_invalid_anchor')
  }
  const head = agentSessionProviderHandleChainHead(record.providerHandleChain)?.handle
  const sourceProviderSessionId =
    head?.provider === 'codex' ? head.threadId : head?.provider === 'claude' ? head.sessionId : null
  if (!sourceProviderSessionId) {
    throw new Error('agent_session_branch_source_identity_missing')
  }
  const items = snapshot.items.slice(0, selected + 1)
  const historyPreview = formatAgentSessionBranchHistory(items)
  const historyAvailable =
    historyPreview.length > 0 &&
    Buffer.byteLength(historyPreview, 'utf8') <= AGENT_SESSION_BRANCH_MAX_CONTENT_BYTES
  return {
    sourceLocation: record.location,
    sourceAgent: record.provider,
    historyPreview: historyAvailable ? historyPreview : null,
    historyPreviewSha256: historyAvailable ? agentSessionBranchContentHash(historyPreview) : null,
    ...(historyAvailable ? {} : { historyPreviewUnavailableReason: 'history-limit' as const }),
    sourceItemIds: items.map((item) => item.itemId),
    nativeProviderForkSupported:
      anchor.body.role === 'assistant' &&
      identity.provider === record.provider &&
      (host.deps.adapter.supportsConversationFork?.(record.provider) ?? false),
    excerpt: excerpt(anchor),
    items,
    sourceProviderSessionId
  }
}
