import {
  AZURE_DEVOPS_REVIEW_THREAD_STATUSES,
  type AzureDevOpsReviewDraftKind
} from '../shared/azure-devops-review-types'
import {
  parseReviewFindingEvidence,
  parseReviewFindingSeverity
} from '../shared/review-finding-input'
import { RuntimeClientError } from './runtime-client'

const DRAFT_KINDS: readonly AzureDevOpsReviewDraftKind[] = ['inline', 'file', 'general', 'reply']
const STATUSES = ['active', 'completed', 'abandoned', 'all'] as const

/** Draft location and body as both the CLI flags and the MCP tool arguments express it. */
export type AzureDevOpsDraftFields = {
  body?: string
  file?: string
  line?: number
  endLine?: number
  side?: string
  threadStatus?: string
  /** As the caller sent them: checked here, so a wrong value is reported before the host is asked. */
  severity?: unknown
  evidence?: unknown
}

function invalid(message: string): never {
  throw new RuntimeClientError('invalid_argument', message)
}

export function parseAzureDevOpsListStatus(value: string | undefined): (typeof STATUSES)[number] {
  if (value === undefined) {
    return 'active'
  }
  if ((STATUSES as readonly string[]).includes(value)) {
    return value as (typeof STATUSES)[number]
  }
  return invalid('--status must be active, completed, abandoned or all')
}

function parseSide(side: string | undefined): 'right' | 'left' | undefined {
  if (side === undefined || side === 'right' || side === 'left') {
    return side
  }
  return invalid('side must be right or left')
}

function parseThreadStatus(status: string | undefined): string | undefined {
  if (
    status === undefined ||
    (AZURE_DEVOPS_REVIEW_THREAD_STATUSES as readonly string[]).includes(status)
  ) {
    return status
  }
  return invalid(`thread status must be one of ${AZURE_DEVOPS_REVIEW_THREAD_STATUSES.join(', ')}`)
}

function anchorFrom(fields: AzureDevOpsDraftFields): Record<string, unknown> | undefined {
  if (fields.line === undefined) {
    if (fields.endLine !== undefined || fields.side !== undefined) {
      invalid('line range needs a start line')
    }
    return undefined
  }
  const endLine = fields.endLine ?? fields.line
  if (endLine < fields.line) {
    invalid('end line must not be before the start line')
  }
  return { side: parseSide(fields.side) ?? 'right', startLine: fields.line, endLine }
}

function findingParams(fields: AzureDevOpsDraftFields): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  if (fields.severity !== undefined) {
    const severity = parseReviewFindingSeverity(fields.severity)
    if (!severity.ok) {
      invalid(severity.error)
    }
    params.severity = severity.value
  }
  if (fields.evidence !== undefined) {
    // Why reject: these surfaces are for agents, which may only attach what Orca can check.
    const evidence = parseReviewFindingEvidence(fields.evidence, { unknownKinds: 'reject' })
    if (!evidence.ok) {
      invalid(evidence.error)
    }
    params.evidence = evidence.value
  }
  return params
}

export function buildAzureDevOpsDraftCreateParams(
  input: AzureDevOpsDraftFields & {
    pr: string
    kind: string
    thread?: number
    commit?: string
    agentLabel?: string
  }
): Record<string, unknown> {
  if (!DRAFT_KINDS.includes(input.kind as AzureDevOpsReviewDraftKind)) {
    invalid('kind must be inline, file, general or reply')
  }
  const kind = input.kind as AzureDevOpsReviewDraftKind
  if (!input.body?.trim()) {
    invalid('A draft needs a body')
  }
  const anchor = anchorFrom(input)
  if (kind === 'inline' && (!input.file || !anchor)) {
    invalid('inline drafts need a file and a line')
  }
  if (kind === 'file' && !input.file) {
    invalid('file drafts need a file')
  }
  if (kind === 'reply' && input.thread === undefined) {
    invalid('reply drafts need a thread id')
  }
  return {
    pullRequestKey: input.pr,
    kind,
    body: input.body,
    ...(input.file ? { filePath: input.file } : {}),
    ...(kind === 'inline' ? { anchor } : {}),
    ...(input.thread !== undefined ? { threadId: input.thread } : {}),
    ...(input.threadStatus ? { threadStatus: parseThreadStatus(input.threadStatus) } : {}),
    ...(input.commit ? { commit: input.commit } : {}),
    ...findingParams(input),
    // Why: these surfaces are how agents write drafts; the label shows who wrote them.
    author: { kind: 'agent', label: input.agentLabel?.trim() || null }
  }
}

export function buildAzureDevOpsDraftPatch(
  input: AzureDevOpsDraftFields & { rebase?: boolean }
): Record<string, unknown> {
  const anchor = anchorFrom(input)
  const patch: Record<string, unknown> = {
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.file !== undefined ? { filePath: input.file } : {}),
    ...(anchor ? { anchor } : {}),
    ...(input.threadStatus !== undefined
      ? { threadStatus: parseThreadStatus(input.threadStatus) }
      : {}),
    ...(input.rebase ? { rebaseToLatest: true } : {}),
    ...findingParams(input)
  }
  if (Object.keys(patch).length === 0) {
    invalid(
      'Nothing to update: pass a body, a location, a thread status, a severity, evidence or --rebase'
    )
  }
  return patch
}
