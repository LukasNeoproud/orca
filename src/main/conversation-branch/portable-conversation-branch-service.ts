import { createHash } from 'node:crypto'
import type { AgentSessionBranchStore } from '../runtime/agent-session-branch-store'
import type { PortableConversationWorkspace } from '../runtime/portable-conversation-workspace'
import type {
  PortableConversationBranchPrepareParams,
  PortableConversationBranchPreviewParams,
  PortableConversationBranchPreviewResult,
  PortableConversationBranchRecord
} from '../../shared/portable-conversation-branch'
import { portableConversationSourceSessionId } from '../../shared/portable-conversation-branch'
import type { PortableConversationSourceContext } from '../../shared/portable-conversation-source'

const MAX_CONTENT_BYTES = 256 * 1024

export type PortableConversationBranchServiceDependencies = {
  store: AgentSessionBranchStore
  readContext: (
    params: PortableConversationBranchPreviewParams
  ) => Promise<PortableConversationSourceContext>
  resolveWorkspace: (
    workspaceId: string,
    executionHostId: string
  ) => Promise<PortableConversationWorkspace>
  now?: () => number
}

export function portableConversationContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export async function previewPortableConversationBranch(
  dependencies: Pick<PortableConversationBranchServiceDependencies, 'readContext'>,
  params: PortableConversationBranchPreviewParams
): Promise<PortableConversationBranchPreviewResult> {
  const context = await dependencies.readContext(params)
  return { context, contextSha256: portableConversationContentHash(context.contextMarkdown) }
}

export async function preparePortableConversationBranch(
  dependencies: PortableConversationBranchServiceDependencies,
  params: PortableConversationBranchPrepareParams
): Promise<PortableConversationBranchRecord> {
  return dependencies.store.runExclusive(`prepare:${params.branchId}`, async () => {
    const [sourceWorkspace, targetWorkspace, preview] = await Promise.all([
      dependencies.resolveWorkspace(params.source.workspace.id, params.source.executionHostId),
      dependencies.resolveWorkspace(params.target.workspaceId, params.target.executionHostId),
      previewPortableConversationBranch(dependencies, {
        source: params.source,
        anchor: params.anchor,
        mode: params.handoff.mode,
        ...(params.anchorRole ? { anchorRole: params.anchorRole } : {})
      })
    ])
    validateWorkspaceBoundary(params, sourceWorkspace, targetWorkspace)
    validateHandoff(params, preview)
    const branch = buildBranch(
      params,
      sourceWorkspace,
      targetWorkspace,
      preview,
      dependencies.now?.()
    )
    const existing = dependencies.store.get(params.branchId)
    if (existing) {
      if (!isPortableConversationBranchRecord(existing) || !samePortableBranch(existing, branch)) {
        throw new Error('portable_conversation_branch_operation_conflict')
      }
      return existing
    }
    if (
      branch.source.sessionId === branch.target.sessionId ||
      dependencies.store.wouldCreateCycle(branch.source.sessionId, branch.target.sessionId)
    ) {
      throw new Error('portable_conversation_branch_cycle')
    }
    return dependencies.store.put(branch) as Promise<PortableConversationBranchRecord>
  })
}

function validateWorkspaceBoundary(
  params: PortableConversationBranchPrepareParams,
  source: PortableConversationWorkspace,
  target: PortableConversationWorkspace
): void {
  if (
    source.path !== params.source.workspace.path ||
    source.kind !== params.source.workspace.kind
  ) {
    throw new Error('portable_conversation_workspace_changed')
  }
  if (source.executionHostId !== target.executionHostId || source.projectId !== target.projectId) {
    throw new Error('portable_conversation_branch_target_mismatch')
  }
}

function validateHandoff(
  params: PortableConversationBranchPrepareParams,
  preview: PortableConversationBranchPreviewResult
): void {
  if (
    !params.handoff.content.trim() ||
    Buffer.byteLength(params.handoff.content) > MAX_CONTENT_BYTES
  ) {
    throw new Error('portable_conversation_branch_content_limit')
  }
  if (params.handoff.sourceContextSha256 !== preview.contextSha256) {
    throw new Error('portable_conversation_branch_preview_stale')
  }
  if (params.handoff.mode === 'history' && preview.context.historyTruncated) {
    throw new Error('portable_conversation_branch_history_truncated')
  }
}

function buildBranch(
  params: PortableConversationBranchPrepareParams,
  sourceWorkspace: PortableConversationWorkspace,
  targetWorkspace: PortableConversationWorkspace,
  preview: PortableConversationBranchPreviewResult,
  clock?: number
): PortableConversationBranchRecord {
  const now = clock ?? Date.now()
  const source = {
    ...params.source,
    executionHostId: sourceWorkspace.executionHostId,
    workspace: {
      id: sourceWorkspace.workspaceId,
      path: sourceWorkspace.path,
      kind: sourceWorkspace.kind
    }
  }
  return {
    schemaVersion: 1,
    branchId: params.branchId,
    title: params.title,
    relationKind: params.relationKind,
    dependsOnBranchIds: params.dependsOnBranchIds ?? [],
    source: {
      sessionId: portableConversationSourceSessionId(source),
      agent: source.provider.agent,
      location: portableLocation(sourceWorkspace),
      anchor: { epoch: preview.context.identity.fingerprint, itemId: params.anchor.messageId },
      excerpt: preview.context.selectedPassage.slice(0, 1024) || '[Portable source response]',
      portable: {
        source,
        anchor: params.anchor,
        identity: preview.context.identity,
        contextSha256: preview.contextSha256,
        projectId: sourceWorkspace.projectId
      }
    },
    target: {
      sessionId: params.target.sessionId,
      agent: params.target.agent,
      location: portableLocation(targetWorkspace),
      terminal: { workspace: portableBranchWorkspace(targetWorkspace), launch: null }
    },
    handoff: {
      mode: params.handoff.mode === 'history' ? 'preserve-history' : 'targeted',
      mechanism: 'portable-transcript',
      content: params.handoff.content,
      contentSha256: portableConversationContentHash(params.handoff.content),
      sourceItemIds: [params.anchor.messageId],
      historyPreview: params.handoff.mode === 'history' ? preview.context.contextMarkdown : null,
      historyPreviewSha256: params.handoff.mode === 'history' ? preview.contextSha256 : null
    },
    providerFork: null,
    state: 'prepared',
    delivery: null,
    error: null,
    createdAt: now,
    updatedAt: now
  }
}

function portableLocation(workspace: PortableConversationWorkspace) {
  return {
    executionHostId: workspace.executionHostId,
    wslDistro: null,
    workspaceId: workspace.workspaceId,
    workspaceKind: workspace.kind
  } as const
}

function portableBranchWorkspace(workspace: PortableConversationWorkspace) {
  return {
    workspaceId: workspace.workspaceId,
    path: workspace.path,
    kind: workspace.kind,
    executionHostId: workspace.executionHostId,
    projectId: workspace.projectId
  }
}

export function isPortableConversationBranchRecord(record: {
  handoff: { mechanism: string }
  source: object
  target: object
}): record is PortableConversationBranchRecord {
  const source = record.source as { portable?: unknown }
  const target = record.target as { terminal?: unknown }
  if (!isRecord(source.portable) || !isRecord(target.terminal)) {
    return false
  }
  const portable = source.portable
  const terminal = target.terminal
  const portableSource = portable.source
  const sourceWorkspace = isRecord(portableSource) ? portableSource.workspace : null
  const sourceProvider = isRecord(portableSource) ? portableSource.provider : null
  const workspace = terminal.workspace
  const launch = terminal.launch
  return (
    record.handoff.mechanism === 'portable-transcript' &&
    isRecord(portableSource) &&
    typeof portableSource.executionHostId === 'string' &&
    portableSource.executionHostId.startsWith('ssh:') &&
    isRecord(sourceWorkspace) &&
    typeof sourceWorkspace.id === 'string' &&
    typeof sourceWorkspace.path === 'string' &&
    (sourceWorkspace.kind === 'git-worktree' || sourceWorkspace.kind === 'folder') &&
    isRecord(sourceProvider) &&
    (sourceProvider.agent === 'claude' || sourceProvider.agent === 'codex') &&
    typeof sourceProvider.sessionId === 'string' &&
    typeof portableSource.transcriptPath === 'string' &&
    isRecord(portable.anchor) &&
    isRecord(portable.identity) &&
    typeof portable.contextSha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(portable.contextSha256) &&
    typeof portable.projectId === 'string' &&
    isRecord(workspace) &&
    typeof workspace.workspaceId === 'string' &&
    typeof workspace.path === 'string' &&
    (workspace.kind === 'git-worktree' || workspace.kind === 'folder') &&
    typeof workspace.executionHostId === 'string' &&
    workspace.executionHostId.startsWith('ssh:') &&
    typeof workspace.projectId === 'string' &&
    (terminal.existingSource === undefined || isRecord(terminal.existingSource)) &&
    (launch === null || validLaunch(launch))
  )
}

function validLaunch(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.attemptId === 'string' &&
    ['pending', 'accepted', 'rejected', 'unknown'].includes(String(value.status)) &&
    (value.receipt === null || (isRecord(value.receipt) && typeof value.receipt.tabId === 'string'))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function samePortableBranch(
  left: PortableConversationBranchRecord,
  right: PortableConversationBranchRecord
): boolean {
  return (
    left.title === right.title &&
    left.relationKind === right.relationKind &&
    JSON.stringify(left.dependsOnBranchIds) === JSON.stringify(right.dependsOnBranchIds) &&
    left.source.sessionId === right.source.sessionId &&
    left.source.anchor.epoch === right.source.anchor.epoch &&
    left.source.anchor.itemId === right.source.anchor.itemId &&
    left.source.portable.source.executionHostId === right.source.portable.source.executionHostId &&
    left.source.portable.source.provider.sessionId ===
      right.source.portable.source.provider.sessionId &&
    left.source.portable.source.transcriptPath === right.source.portable.source.transcriptPath &&
    left.source.portable.identity.fingerprint === right.source.portable.identity.fingerprint &&
    left.source.portable.contextSha256 === right.source.portable.contextSha256 &&
    left.target.sessionId === right.target.sessionId &&
    left.target.agent === right.target.agent &&
    left.target.location.executionHostId === right.target.location.executionHostId &&
    left.target.location.workspaceId === right.target.location.workspaceId &&
    left.target.location.workspaceKind === right.target.location.workspaceKind &&
    left.target.terminal.workspace.path === right.target.terminal.workspace.path &&
    left.target.terminal.workspace.projectId === right.target.terminal.workspace.projectId &&
    left.handoff.mode === right.handoff.mode &&
    left.handoff.contentSha256 === right.handoff.contentSha256
  )
}
