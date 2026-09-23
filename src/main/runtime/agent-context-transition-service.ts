import {
  AgentContextTransitionDependencyInspectionSchema,
  AgentContextTransitionConversationSourceSchema,
  AgentContextTransitionInputSchema,
  AgentContextTransitionResultSchema,
  AgentContextTransitionSourceSchema,
  AgentContextTransitionTargetSchema,
  agentContextTransitionErrorCode,
  agentContextTransitionPolicyAllows,
  agentContextTransitionSourceOf,
  type AgentContextTransitionConversationSource as ConversationSource,
  type AgentContextTransitionDependencyInspection as Inspection,
  type AgentContextTransitionExecutionControl as ExecutionControl,
  type AgentContextTransitionInput as Input,
  type AgentContextTransitionPolicy,
  type AgentContextTransitionRequest as Request,
  type AgentContextTransitionResult as Result,
  type AgentContextTransitionSource as Source,
  type AgentContextTransitionTarget as Target
} from '../../shared/agent-context-transition'
import type { AgentContextTransitionStore } from './agent-context-transition-store'

export type AgentContextTransitionServiceDeps = {
  store: AgentContextTransitionStore
  inspect: (request: Request) => Promise<Inspection>
  execute: (request: Request, revision: string, control: ExecutionControl) => Promise<Result>
  policy?: () => AgentContextTransitionPolicy
  cooldownMs?: number
  now?: () => number
}

export class AgentContextTransitionService {
  private tickPromise: Promise<void> | null = null

  constructor(private readonly deps: AgentContextTransitionServiceDeps) {}

  async accept(target: Target, input: Input, requestId: string): Promise<Request> {
    const parsedTarget = AgentContextTransitionTargetSchema.parse(target)
    const parsedInput = AgentContextTransitionInputSchema.parse(input)
    if (!requestId.trim() || requestId.length > 256) {
      throw new Error('agent_context_transition_request_id_invalid')
    }
    const policy = this.deps.policy?.() ?? 'off'
    if (policy === 'off') {
      throw new Error('agent_context_transition_policy_off')
    }
    if (policy === 'compact' && parsedInput.mode === 'fresh') {
      throw new Error('agent_context_transition_fresh_disabled')
    }
    const now = this.nowIso()
    return this.deps.store.accept(
      {
        requestId,
        target: parsedTarget,
        input: parsedInput,
        status: 'queued',
        createdAt: now,
        updatedAt: now
      },
      this.deps.cooldownMs ?? 5 * 60_000
    )
  }

  status(source: Source, requestId: string): Request | null {
    return this.deps.store.get(AgentContextTransitionSourceSchema.parse(source), requestId)
  }

  list(source: Source): Request[] {
    return this.deps.store.list(AgentContextTransitionSourceSchema.parse(source))
  }

  listConversation(source: ConversationSource): Request[] {
    return this.deps.store.listConversation(
      AgentContextTransitionConversationSourceSchema.parse(source)
    )
  }

  cancelConversation(source: ConversationSource, requestId: string): Promise<Request | null> {
    const parsed = AgentContextTransitionConversationSourceSchema.parse(source)
    const request = this.deps.store
      .listConversation(parsed)
      .find((candidate) => candidate.requestId === requestId)
    return request
      ? this.cancel(agentContextTransitionSourceOf(request.target), requestId)
      : Promise.resolve(null)
  }

  async cancel(source: Source, requestId: string): Promise<Request | null> {
    const parsedSource = AgentContextTransitionSourceSchema.parse(source)
    return this.deps.store.update(parsedSource, requestId, (request) =>
      ['queued', 'ready', 'preparing'].includes(request.status)
        ? {
            ...request,
            status: 'cancelled',
            errorCode: 'cancelled_by_request',
            updatedAt: this.nowIso()
          }
        : request
    )
  }

  tick(): Promise<void> {
    return (this.tickPromise ??= this.runTick().finally(() => {
      this.tickPromise = null
    }))
  }

  private async runTick(): Promise<void> {
    await this.deps.store.settled()
    for (const request of this.deps.store.actionable()) {
      if (!agentContextTransitionPolicyAllows(this.deps.policy?.() ?? 'off', request.input)) {
        await this.finish(request, 'cancelled', 'policy_changed')
        continue
      }
      if (request.status === 'queued' || request.status === 'ready') {
        await this.advance(request)
      } else if (request.status === 'preparing') {
        await this.executePreparation(request)
      }
    }
  }

  private async advance(request: Request): Promise<void> {
    const inspection = await this.inspect(request)
    if (!inspection) {
      return
    }
    if (inspection.status !== 'ready') {
      await this.applyInspection(request, inspection)
      return
    }
    if (request.status === 'queued') {
      const ready = await this.deps.store.updateIf(request, ['queued'], (current) => ({
        ...current,
        status: 'ready',
        revision: inspection.revision,
        lastInspection: 'ready',
        errorCode: undefined,
        updatedAt: this.nowIso()
      }))
      if (ready) {
        await this.advance(ready)
      }
      return
    }
    if (!request.revision || request.revision !== inspection.revision) {
      await this.finish(request, 'stale', 'source_revision_changed')
      return
    }
    const preparing = await this.deps.store.updateIf(request, ['ready'], (current) => ({
      ...current,
      status: 'preparing',
      lastInspection: 'ready',
      errorCode: undefined,
      updatedAt: this.nowIso()
    }))
    if (preparing) {
      await this.executePreparation(preparing)
    }
  }

  private async executePreparation(request: Request): Promise<void> {
    const revision = request.revision
    if (!revision) {
      await this.finish(request, 'failed', 'source_revision_missing')
      return
    }
    const guard = (): Promise<boolean> => this.guard(request, revision)
    const markEffectPossible = async (): Promise<boolean> => {
      if (!(await guard())) {
        return false
      }
      const executing = await this.deps.store.updateIf(request, ['preparing'], (current) => ({
        ...current,
        status: 'executing',
        effectStartedAt: this.nowIso(),
        updatedAt: this.nowIso()
      }))
      return executing?.status === 'executing'
    }
    try {
      const rawResult = await this.deps.execute(request, revision, {
        guard,
        markEffectPossible,
        recordResult: async (result) => {
          await this.deps.store.updateIf(request, ['executing'], (current) => ({
            ...current,
            result: AgentContextTransitionResultSchema.parse(result),
            updatedAt: this.nowIso()
          }))
        }
      })
      const current = this.deps.store.current(request)
      if (current?.status === 'executing') {
        const result = AgentContextTransitionResultSchema.parse(rawResult)
        const completedAt = this.nowIso()
        await this.deps.store.updateIf(current, ['executing'], (executing) => ({
          ...executing,
          status: 'completed',
          result,
          errorCode: undefined,
          completedAt,
          updatedAt: completedAt
        }))
      } else if (current?.status === 'preparing' && current.lastInspection !== 'unverifiable') {
        await this.finish(current, 'failed', 'execution_boundary_not_marked')
      }
    } catch (error) {
      const current = this.deps.store.current(request)
      if (current?.status === 'executing') {
        await this.finish(
          current,
          'unconfirmed',
          agentContextTransitionErrorCode(error, 'execution_outcome_unconfirmed')
        )
      } else if (current?.status === 'preparing' && current.lastInspection !== 'unverifiable') {
        await this.finish(
          current,
          'failed',
          agentContextTransitionErrorCode(error, 'provider_preparation_failed')
        )
      }
    }
  }

  private async guard(request: Request, revision: string): Promise<boolean> {
    const current = this.deps.store.current(request)
    if (current?.status !== 'preparing') {
      return false
    }
    if (!agentContextTransitionPolicyAllows(this.deps.policy?.() ?? 'off', current.input)) {
      await this.finish(current, 'cancelled', 'policy_changed')
      return false
    }
    const inspection = await this.inspect(current)
    if (!inspection) {
      return false
    }
    if (inspection.status === 'ready' && inspection.revision === revision) {
      return this.deps.store.current(current)?.status === 'preparing'
    }
    if (inspection.status === 'unverifiable') {
      await this.applyInspection(current, inspection)
      return false
    }
    if (inspection.status === 'waiting' || inspection.status === 'ready') {
      await this.finish(current, 'stale', 'source_changed_during_preparation')
      return false
    }
    await this.applyInspection(current, inspection)
    return false
  }

  private async applyInspection(
    request: Request,
    inspection: Exclude<Inspection, { status: 'ready' }>
  ): Promise<void> {
    if (inspection.status === 'waiting' || inspection.status === 'unverifiable') {
      const errorCode =
        inspection.status === 'unverifiable'
          ? (inspection.errorCode ?? 'source_unverifiable')
          : undefined
      await this.deps.store.updateIf(request, ['queued', 'ready', 'preparing'], (current) => ({
        ...(current.lastInspection === inspection.status && current.errorCode === errorCode
          ? current
          : { ...current, lastInspection: inspection.status, errorCode, updatedAt: this.nowIso() })
      }))
      return
    }
    const status =
      inspection.status === 'stale'
        ? 'stale'
        : inspection.status === 'stopped'
          ? 'cancelled'
          : 'failed'
    await this.finish(
      request,
      status,
      inspection.errorCode ?? `source_${inspection.status}`,
      inspection.status
    )
  }

  private async finish(
    request: Request,
    status: 'cancelled' | 'stale' | 'failed' | 'unconfirmed',
    errorCode: string,
    lastInspection?: Request['lastInspection']
  ): Promise<void> {
    await this.deps.store.updateIf(
      request,
      ['queued', 'ready', 'preparing', 'executing'],
      (current) => ({
        ...current,
        status,
        errorCode,
        ...(lastInspection ? { lastInspection } : {}),
        updatedAt: this.nowIso()
      })
    )
  }

  private async inspect(request: Request): Promise<Inspection | null> {
    try {
      const inspection = await this.deps.inspect(structuredClone(request))
      return AgentContextTransitionDependencyInspectionSchema.parse(inspection)
    } catch (error) {
      await this.finish(
        request,
        'failed',
        agentContextTransitionErrorCode(error, 'dependency_inspection_failed')
      )
      return null
    }
  }

  private nowIso = (): string => new Date(this.deps.now?.() ?? Date.now()).toISOString()
}
