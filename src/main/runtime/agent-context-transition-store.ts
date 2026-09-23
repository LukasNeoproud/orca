import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import {
  AgentContextTransitionRequestSchema,
  agentContextTransitionSourceOf,
  type AgentContextTransitionConversationSource,
  type AgentContextTransitionRequest,
  type AgentContextTransitionSource
} from '../../shared/agent-context-transition'
import { durableWriteTempPath, renameDurable, writeTempFileDurable } from '../durable-file-write'

const STORE_FILE_NAME = 'agent-context-transition-requests.json'
const STORE_SCHEMA_VERSION = 1
const DEFAULT_MAX_REQUESTS = 256
const ACTIVE_STATUSES = new Set<AgentContextTransitionRequest['status']>([
  'queued',
  'ready',
  'preparing',
  'executing',
  'unconfirmed'
])
const ACTIONABLE_STATUSES = new Set<AgentContextTransitionRequest['status']>([
  'queued',
  'ready',
  'preparing'
])

const PersistedStateSchema = z
  .object({
    schemaVersion: z.literal(STORE_SCHEMA_VERSION),
    requests: z.array(AgentContextTransitionRequestSchema).max(DEFAULT_MAX_REQUESTS)
  })
  .strict()

type StoreOptions = {
  maxRequests?: number
  now?: () => number
}

function sourceKey(source: AgentContextTransitionSource): string {
  return JSON.stringify([source.workspaceId, source.providerSessionId, source.sourceGeneration])
}

function sameSource(
  left: AgentContextTransitionSource,
  right: AgentContextTransitionSource
): boolean {
  return sourceKey(left) === sourceKey(right)
}

function clone(request: AgentContextTransitionRequest): AgentContextTransitionRequest {
  return structuredClone(request)
}

function sameSubmission(
  current: AgentContextTransitionRequest,
  incoming: AgentContextTransitionRequest
): boolean {
  return (
    JSON.stringify(current.target) === JSON.stringify(incoming.target) &&
    JSON.stringify(current.input) === JSON.stringify(incoming.input)
  )
}

export class AgentContextTransitionStore {
  private requests: Map<string, AgentContextTransitionRequest>
  private operations = Promise.resolve()
  private readonly recoveryWrite: Promise<void>
  private readonly maxRequests: number
  private readonly now: () => number
  private readonly filePath: string

  constructor(directory: string, options: StoreOptions = {}) {
    this.filePath = join(directory, STORE_FILE_NAME)
    this.maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS
    this.now = options.now ?? Date.now
    const recoveredAt = new Date(this.now()).toISOString()
    let recovered = false
    this.requests = new Map(
      this.load().map((request) => {
        if (request.status !== 'executing') {
          return [request.requestId, request]
        }
        recovered = true
        return [
          request.requestId,
          {
            ...request,
            status: 'unconfirmed' as const,
            errorCode: 'execution_outcome_unknown_after_restart',
            updatedAt: recoveredAt
          }
        ]
      })
    )
    this.recoveryWrite = recovered
      ? this.enqueue(async () => this.persist(this.requests))
      : Promise.resolve()
  }

  get(
    source: AgentContextTransitionSource,
    requestId: string
  ): AgentContextTransitionRequest | null {
    const request = this.requests.get(requestId)
    return request && sameSource(agentContextTransitionSourceOf(request.target), source)
      ? clone(request)
      : null
  }

  current(request: AgentContextTransitionRequest): AgentContextTransitionRequest | null {
    return this.get(agentContextTransitionSourceOf(request.target), request.requestId)
  }

  list(source: AgentContextTransitionSource): AgentContextTransitionRequest[] {
    return [...this.requests.values()]
      .filter((request) => sameSource(agentContextTransitionSourceOf(request.target), source))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone)
  }

  listConversation(
    source: AgentContextTransitionConversationSource
  ): AgentContextTransitionRequest[] {
    return [...this.requests.values()]
      .filter(
        (request) =>
          request.target.workspaceId === source.workspaceId &&
          (request.target.providerSessionId === source.providerSessionId ||
            request.result?.newProviderSessionId === source.providerSessionId)
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone)
  }

  actionable(): AgentContextTransitionRequest[] {
    return [...this.requests.values()]
      .filter((request) => ACTIONABLE_STATUSES.has(request.status))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(clone)
  }

  accept(
    request: AgentContextTransitionRequest,
    cooldownMs: number
  ): Promise<AgentContextTransitionRequest> {
    return this.mutate(async (next) => {
      const duplicate = next.get(request.requestId)
      if (duplicate) {
        if (!sameSubmission(duplicate, request)) {
          throw new Error('agent_context_transition_request_id_conflict')
        }
        return { value: clone(duplicate), changed: false }
      }
      const source = agentContextTransitionSourceOf(request.target)
      const sameSourceRequests = [...next.values()].filter((candidate) =>
        sameSource(agentContextTransitionSourceOf(candidate.target), source)
      )
      if (sameSourceRequests.some((candidate) => ACTIVE_STATUSES.has(candidate.status))) {
        throw new Error('agent_context_transition_source_busy')
      }
      const cooldownBoundary = this.now() - cooldownMs
      if (
        [...next.values()].some(
          (candidate) =>
            candidate.target.workspaceId === request.target.workspaceId &&
            candidate.status === 'completed' &&
            Date.parse(candidate.completedAt ?? candidate.updatedAt) > cooldownBoundary
        )
      ) {
        throw new Error('agent_context_transition_cooldown')
      }
      this.makeRoom(next, cooldownBoundary)
      next.set(request.requestId, clone(request))
      return { value: clone(request), changed: true }
    })
  }

  update(
    source: AgentContextTransitionSource,
    requestId: string,
    updater: (request: AgentContextTransitionRequest) => AgentContextTransitionRequest
  ): Promise<AgentContextTransitionRequest | null> {
    return this.mutate(async (next) => {
      const current = next.get(requestId)
      if (!current || !sameSource(agentContextTransitionSourceOf(current.target), source)) {
        return { value: null, changed: false }
      }
      const updated = AgentContextTransitionRequestSchema.parse(updater(clone(current)))
      if (JSON.stringify(updated) === JSON.stringify(current)) {
        return { value: clone(current), changed: false }
      }
      next.set(requestId, clone(updated))
      return { value: clone(updated), changed: true }
    })
  }

  updateIf(
    request: AgentContextTransitionRequest,
    statuses: AgentContextTransitionRequest['status'][],
    updater: (request: AgentContextTransitionRequest) => AgentContextTransitionRequest
  ): Promise<AgentContextTransitionRequest | null> {
    return this.update(
      agentContextTransitionSourceOf(request.target),
      request.requestId,
      (current) => (statuses.includes(current.status) ? updater(current) : current)
    )
  }

  async settled(): Promise<void> {
    await this.recoveryWrite
    await this.operations
  }

  private makeRoom(
    requests: Map<string, AgentContextTransitionRequest>,
    cooldownBoundary: number
  ): void {
    if (requests.size < this.maxRequests) {
      return
    }
    const removable = [...requests.values()]
      .filter(
        (request) =>
          !ACTIVE_STATUSES.has(request.status) &&
          (request.status !== 'completed' || Date.parse(request.updatedAt) <= cooldownBoundary)
      )
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    const oldest = removable[0]
    if (!oldest) {
      throw new Error('agent_context_transition_store_full')
    }
    requests.delete(oldest.requestId)
  }

  private mutate<T>(
    mutation: (
      requests: Map<string, AgentContextTransitionRequest>
    ) => Promise<{ value: T; changed: boolean }>
  ): Promise<T> {
    return this.enqueue(async () => {
      const next = new Map(
        [...this.requests].map(([requestId, request]) => [requestId, clone(request)])
      )
      const result = await mutation(next)
      if (result.changed) {
        await this.persist(next)
        this.requests = next
      }
      return result.value
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation, operation)
    this.operations = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private load(): AgentContextTransitionRequest[] {
    if (!existsSync(this.filePath)) {
      return []
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown
    } catch (error) {
      throw new Error(`Could not read agent context transition state at ${this.filePath}`, {
        cause: error
      })
    }
    const state = PersistedStateSchema.safeParse(parsed)
    if (!state.success) {
      throw new Error(`Agent context transition state at ${this.filePath} has an unsupported shape`)
    }
    return state.data.requests.map(clone)
  }

  private async persist(requests: Map<string, AgentContextTransitionRequest>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporary = durableWriteTempPath(this.filePath)
    const payload = `${JSON.stringify(
      { schemaVersion: STORE_SCHEMA_VERSION, requests: [...requests.values()] },
      null,
      2
    )}\n`
    let renamed = false
    try {
      await writeTempFileDurable(temporary, payload, 0o600)
      await renameDurable(temporary, this.filePath)
      renamed = true
    } finally {
      if (!renamed) {
        await rm(temporary, { force: true }).catch(() => undefined)
      }
    }
  }
}
