import type { AgentJournalDispatchState } from './agent-session-journal-types'
import {
  isAgentSessionExecutionLocation,
  type AgentSessionExecutionLocation
} from './agent-session-record'
import type { AgentSessionMutationEnvelope } from './agent-session-wire'
import type { StructuredAgentSessionCreateParams } from './structured-agent-session-create'

export const AGENT_SESSION_BRANCH_RELATION_KINDS = ['discussion', 'subtask', 'alternative'] as const
export type AgentSessionBranchRelationKind = (typeof AGENT_SESSION_BRANCH_RELATION_KINDS)[number]

export type AgentSessionBranchAnchor = {
  epoch: string
  itemId: string
}

export type AgentSessionBranchHandoffMode = 'preserve-history' | 'targeted'
export type AgentSessionBranchTransferMechanism =
  | 'native-provider-fork'
  | 'portable-transcript'
  | 'relationship-only'

/** Immutable payload prepared for the child. `content` is the exact later user turn. */
export type AgentSessionBranchHandoff = {
  mode: AgentSessionBranchHandoffMode
  mechanism: AgentSessionBranchTransferMechanism
  /** Exact immutable user turn sent only by branchStart. */
  content: string
  contentSha256: string
  sourceItemIds: string[]
  /** Exact bounded source prefix shown before a preserve-history branch is created. */
  historyPreview: string | null
  historyPreviewSha256: string | null
}

export type AgentSessionBranchDelivery = {
  clientMessageId: string
  status: AgentJournalDispatchState
  reason: string | null
  submittedAt: number
  resolvedAt: number | null
}

export type AgentSessionBranchState =
  | 'preparing'
  | 'forking'
  | 'fork-unverified'
  | 'prepared'
  | 'starting'
  | 'started'
  | 'delivery-unverified'
  | 'failed'

export type AgentSessionBranchRecord = {
  schemaVersion: 1
  branchId: string
  title: string
  relationKind: AgentSessionBranchRelationKind
  dependsOnBranchIds: string[]
  source: {
    sessionId: string
    agent: 'claude' | 'codex'
    location: AgentSessionExecutionLocation
    anchor: AgentSessionBranchAnchor
    excerpt: string
  }
  target: {
    sessionId: string
    agent: 'claude' | 'codex'
    location: AgentSessionExecutionLocation
    create?: StructuredAgentSessionCreateParams
  }
  handoff: AgentSessionBranchHandoff
  providerFork: null | {
    sourceProviderSessionId: string
    targetProviderSessionId: string | null
    boundaryItemId: string
  }
  state: AgentSessionBranchState
  delivery: AgentSessionBranchDelivery | null
  error: string | null
  createdAt: number
  updatedAt: number
}

export type AgentSessionBranchPrepareParams = {
  branchId: string
  title: string
  sourceSessionId: string
  expectedEpoch: string
  sourceItemId: string
  relationKind: AgentSessionBranchRelationKind
  dependsOnBranchIds?: string[]
  target: { create: StructuredAgentSessionCreateParams }
  handoff:
    | { mode: 'preserve-history'; instruction: string; historyPreviewSha256: string }
    | { mode: 'targeted'; content: string; sourceItemIds: string[] }
}

export type AgentSessionBranchPreviewParams = {
  sourceSessionId: string
  expectedEpoch: string
  sourceItemId: string
}

export type AgentSessionBranchPreviewResult = {
  sourceLocation: AgentSessionExecutionLocation
  sourceAgent: 'claude' | 'codex'
  historyPreview: string | null
  historyPreviewSha256: string | null
  historyPreviewUnavailableReason?: 'history-limit'
  sourceItemIds: string[]
  nativeProviderForkSupported: boolean
}

export type AgentSessionBranchPrepareResult = { branch: AgentSessionBranchRecord }

export type AgentSessionBranchStartParams = {
  branchId: string
  envelope: AgentSessionMutationEnvelope
  retryUnknown?: true
}

export type AgentSessionBranchStartResult = { branch: AgentSessionBranchRecord }
export type AgentSessionBranchesResult = {
  branches: AgentSessionBranchRecord[]
  returns: AgentSessionReturnArtifact[]
}

export type AgentSessionBranchAttachParams = {
  branchId: string
  title: string
  sourceSessionId: string
  expectedEpoch: string
  sourceItemId: string
  relationKind: AgentSessionBranchRelationKind
  dependsOnBranchIds?: string[]
  targetSessionId: string
  handoff: { content: string; sourceItemIds: string[] }
}

export type AgentSessionReturnArtifact = {
  schemaVersion: 1
  returnId: string
  branchId: string
  sourceSessionId: string
  targetSessionId: string
  content: string
  contentSha256: string
  delivery: AgentSessionBranchDelivery | null
  integrationState: 'reported' | 'integrated'
  createdAt: number
  updatedAt: number
}

export type AgentSessionBranchResultPrepareParams = {
  returnId: string
  branchId: string
  content: string
}
export type AgentSessionBranchResultSendParams = {
  returnId: string
  envelope: AgentSessionMutationEnvelope
  retryUnknown?: true
}
export type AgentSessionBranchResult = { result: AgentSessionReturnArtifact }

const HASH = /^[0-9a-f]{64}$/
const DELIVERY_STATES: readonly AgentJournalDispatchState[] = [
  'pending',
  'accepted',
  'rejected',
  'unknown'
]

function bounded(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

export function isAgentSessionBranchRecord(value: unknown): value is AgentSessionBranchRecord {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Partial<AgentSessionBranchRecord>
  const source = record.source
  const target = record.target
  const handoff = record.handoff
  const delivery = record.delivery
  return (
    record.schemaVersion === 1 &&
    bounded(record.branchId, 512) &&
    bounded(record.title, 512) &&
    AGENT_SESSION_BRANCH_RELATION_KINDS.includes(record.relationKind as never) &&
    Array.isArray(record.dependsOnBranchIds) &&
    record.dependsOnBranchIds.length <= 256 &&
    record.dependsOnBranchIds.every((id) => bounded(id, 512)) &&
    !!source &&
    bounded(source.sessionId, 512) &&
    (source.agent === 'claude' || source.agent === 'codex') &&
    isAgentSessionExecutionLocation(source.location) &&
    bounded(source.anchor?.epoch, 512) &&
    bounded(source.anchor?.itemId, 4096) &&
    bounded(source.excerpt, 1024) &&
    !!target &&
    bounded(target.sessionId, 512) &&
    (target.agent === 'claude' || target.agent === 'codex') &&
    isAgentSessionExecutionLocation(target.location) &&
    (target.create === undefined ||
      (!!target.create && target.create.envelope?.sessionId === target.sessionId)) &&
    !!handoff &&
    (handoff.mode === 'preserve-history' || handoff.mode === 'targeted') &&
    (handoff.mechanism === 'native-provider-fork' ||
      handoff.mechanism === 'portable-transcript' ||
      handoff.mechanism === 'relationship-only') &&
    bounded(handoff.content, 256 * 1024) &&
    HASH.test(handoff.contentSha256 ?? '') &&
    Array.isArray(handoff.sourceItemIds) &&
    handoff.sourceItemIds.length <= 10_000 &&
    handoff.sourceItemIds.every((itemId) => bounded(itemId, 4096)) &&
    (handoff.historyPreview === null || bounded(handoff.historyPreview, 256 * 1024)) &&
    (handoff.historyPreviewSha256 === null || HASH.test(handoff.historyPreviewSha256 ?? '')) &&
    [
      'preparing',
      'forking',
      'fork-unverified',
      'prepared',
      'starting',
      'started',
      'delivery-unverified',
      'failed'
    ].includes(record.state ?? '') &&
    (record.providerFork === null ||
      (!!record.providerFork &&
        bounded(record.providerFork.sourceProviderSessionId, 512) &&
        (record.providerFork.targetProviderSessionId === null ||
          bounded(record.providerFork.targetProviderSessionId, 512)) &&
        bounded(record.providerFork.boundaryItemId, 4096))) &&
    (delivery === null ||
      (!!delivery &&
        bounded(delivery.clientMessageId, 512) &&
        DELIVERY_STATES.includes(delivery.status) &&
        (delivery.reason === null || bounded(delivery.reason, 4096)) &&
        Number.isFinite(delivery.submittedAt) &&
        (delivery.resolvedAt === null || Number.isFinite(delivery.resolvedAt)))) &&
    (record.error === null || bounded(record.error, 4096)) &&
    Number.isFinite(record.createdAt) &&
    Number.isFinite(record.updatedAt)
  )
}

export function isAgentSessionReturnArtifact(value: unknown): value is AgentSessionReturnArtifact {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as Partial<AgentSessionReturnArtifact>
  const delivery = item.delivery
  return (
    item.schemaVersion === 1 &&
    bounded(item.returnId, 512) &&
    bounded(item.branchId, 512) &&
    bounded(item.sourceSessionId, 512) &&
    bounded(item.targetSessionId, 512) &&
    bounded(item.content, 256 * 1024) &&
    HASH.test(item.contentSha256 ?? '') &&
    (delivery === null ||
      (!!delivery &&
        bounded(delivery.clientMessageId, 512) &&
        DELIVERY_STATES.includes(delivery.status))) &&
    (item.integrationState === 'reported' || item.integrationState === 'integrated') &&
    Number.isFinite(item.createdAt) &&
    Number.isFinite(item.updatedAt)
  )
}
