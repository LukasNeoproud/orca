import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  agentContextTransitionSourceOf,
  type AgentContextTransitionDependencyInspection,
  type AgentContextTransitionInput,
  type AgentContextTransitionResult,
  type AgentContextTransitionTarget
} from '../../shared/agent-context-transition'
import { AgentContextTransitionService } from './agent-context-transition-service'
import { AgentContextTransitionStore } from './agent-context-transition-store'

const roots: string[] = []
const target = (generation = 'generation-1'): AgentContextTransitionTarget => ({
  workspaceId: 'repo::/workspace',
  providerSessionId: 'provider-session',
  sourceGeneration: generation,
  turnId: 'turn-1',
  userMessageCount: 4,
  journalUserMessageCount: 4,
  sessionId: 'session-1',
  terminalHandle: 'terminal-1'
})
const input = (mode: 'compact' | 'fresh' = 'compact'): AgentContextTransitionInput => ({
  mode,
  reason: 'A coherent topic is complete.',
  checkpoint: {
    goal: 'Finish the context transition engine.',
    completed: 'The request has reached a safe boundary.',
    decisions: ['Persist execution intent before source effects.'],
    constraints: ['Keep the current authorization scope.'],
    changes: ['Added the request state machine.'],
    verification: ['Unit tests cover recovery.'],
    openQuestions: [],
    nextStep: 'Continue with runtime integration.'
  },
  continuation: 'continue'
})
const result: AgentContextTransitionResult = {
  newProviderSessionId: 'provider-session-next',
  newSessionId: 'session-next'
}

async function temporaryDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'orca-context-transition-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function serviceFor(
  store: AgentContextTransitionStore,
  options: {
    inspect?: () => Promise<AgentContextTransitionDependencyInspection>
    execute?: ConstructorParameters<typeof AgentContextTransitionService>[0]['execute']
    policy?: () => 'off' | 'compact' | 'all'
    now?: () => number
    cooldownMs?: number
  } = {}
): AgentContextTransitionService {
  return new AgentContextTransitionService({
    store,
    inspect: options.inspect ?? (async () => ({ status: 'ready', revision: 'revision-1' })),
    execute:
      options.execute ??
      (async (_request, _revision, control) => {
        if (!(await control.guard()) || !(await control.markEffectPossible())) {
          throw new Error('guard refused')
        }
        return result
      }),
    policy: options.policy ?? (() => 'all'),
    now: options.now,
    cooldownMs: options.cooldownMs
  })
}

describe('AgentContextTransitionService', () => {
  it('returns from accept without waiting for the owning turn to settle', async () => {
    const store = new AgentContextTransitionStore(await temporaryDirectory())
    let settle!: (inspection: AgentContextTransitionDependencyInspection) => void
    const inspection = new Promise<AgentContextTransitionDependencyInspection>((resolve) => {
      settle = resolve
    })
    const inspect = vi.fn(() => inspection)
    const service = serviceFor(store, { inspect })

    const accepted = await service.accept(target(), input(), 'request-1')

    expect(accepted.status).toBe('queued')
    expect(inspect).not.toHaveBeenCalled()
    const ticking = service.tick()
    await vi.waitFor(() => expect(inspect).toHaveBeenCalledTimes(1))
    settle({ status: 'ready', revision: 'revision-1' })
    await ticking
    expect(service.status(agentContextTransitionSourceOf(target()), 'request-1')?.status).toBe(
      'completed'
    )
  })

  it('deduplicates the same request and rejects conflicting or concurrent submissions', async () => {
    const store = new AgentContextTransitionStore(await temporaryDirectory())
    const service = serviceFor(store)
    const first = await service.accept(target(), input(), 'request-1')

    await expect(service.accept(target(), input(), 'request-1')).resolves.toEqual(first)
    await expect(service.accept(target(), input('fresh'), 'request-1')).rejects.toThrow(
      'agent_context_transition_request_id_conflict'
    )
    await expect(service.accept(target(), input(), 'request-2')).rejects.toThrow(
      'agent_context_transition_source_busy'
    )
    expect(service.list(agentContextTransitionSourceOf(target()))).toHaveLength(1)
  })

  it('marks a request stale when the source revision changes during preparation', async () => {
    const store = new AgentContextTransitionStore(await temporaryDirectory())
    let inspections = 0
    const execute = vi.fn(async (_request, _revision, control) => {
      expect(await control.guard()).toBe(false)
      return result
    })
    const service = serviceFor(store, {
      inspect: async () => ({
        status: 'ready',
        revision: ++inspections < 3 ? 'revision-1' : 'revision-2'
      }),
      execute
    })
    await service.accept(target(), input(), 'request-1')

    await service.tick()

    expect(execute).toHaveBeenCalledOnce()
    expect(service.status(agentContextTransitionSourceOf(target()), 'request-1')).toMatchObject({
      status: 'stale',
      errorCode: 'source_changed_during_preparation'
    })
  })

  it('honors cancellation and a positively stopped source before execution', async () => {
    const root = await temporaryDirectory()
    const execute = vi.fn(async () => result)
    const cancelledService = serviceFor(new AgentContextTransitionStore(join(root, 'cancel')), {
      execute
    })
    await cancelledService.accept(target(), input(), 'cancelled')
    await cancelledService.cancel(agentContextTransitionSourceOf(target()), 'cancelled')
    await cancelledService.tick()
    expect(
      cancelledService.status(agentContextTransitionSourceOf(target()), 'cancelled')?.status
    ).toBe('cancelled')

    const stoppedTarget = target('generation-stopped')
    const stoppedService = serviceFor(new AgentContextTransitionStore(join(root, 'stop')), {
      inspect: async () => ({ status: 'stopped', errorCode: 'agent_stopped' }),
      execute
    })
    await stoppedService.accept(stoppedTarget, input(), 'stopped')
    await stoppedService.tick()
    expect(
      stoppedService.status(agentContextTransitionSourceOf(stoppedTarget), 'stopped')
    ).toMatchObject({ status: 'cancelled', errorCode: 'agent_stopped' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('lets cancellation win a race before the durable effect boundary', async () => {
    const store = new AgentContextTransitionStore(await temporaryDirectory())
    let preparationStarted!: () => void
    let continuePreparation!: () => void
    const started = new Promise<void>((resolve) => {
      preparationStarted = resolve
    })
    const released = new Promise<void>((resolve) => {
      continuePreparation = resolve
    })
    const service = serviceFor(store, {
      execute: async (_request, _revision, control) => {
        preparationStarted()
        await released
        expect(await control.markEffectPossible()).toBe(false)
        return result
      }
    })
    await service.accept(target(), input(), 'request-1')
    const ticking = service.tick()
    await started
    await service.cancel(agentContextTransitionSourceOf(target()), 'request-1')
    continuePreparation()
    await ticking

    expect(service.status(agentContextTransitionSourceOf(target()), 'request-1')?.status).toBe(
      'cancelled'
    )
  })

  it('re-evaluates queued work after restart', async () => {
    const root = await temporaryDirectory()
    const firstStore = new AgentContextTransitionStore(root)
    await serviceFor(firstStore).accept(target(), input(), 'request-1')
    await firstStore.settled()

    const restored = serviceFor(new AgentContextTransitionStore(root))
    await restored.tick()

    expect(restored.status(agentContextTransitionSourceOf(target()), 'request-1')?.status).toBe(
      'completed'
    )
  })

  it('restores an executing request as unconfirmed without replaying it', async () => {
    const root = await temporaryDirectory()
    const firstStore = new AgentContextTransitionStore(root)
    let marked!: () => void
    let release!: () => void
    const effectMarked = new Promise<void>((resolve) => {
      marked = resolve
    })
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = serviceFor(firstStore, {
      execute: async (_request, _revision, control) => {
        expect(await control.markEffectPossible()).toBe(true)
        marked()
        await blocked
        return result
      }
    })
    await first.accept(target(), input(), 'request-1')
    const ticking = first.tick()
    await effectMarked

    const restoredStore = new AgentContextTransitionStore(root)
    expect(restoredStore.get(agentContextTransitionSourceOf(target()), 'request-1')).toMatchObject({
      status: 'unconfirmed',
      errorCode: 'execution_outcome_unknown_after_restart'
    })
    await restoredStore.settled()
    release()
    await ticking
  })

  it('distinguishes definitive preparation failure from unknown execution outcome', async () => {
    const root = await temporaryDirectory()
    const failed = serviceFor(new AgentContextTransitionStore(join(root, 'failed')), {
      execute: async () => {
        throw new Error('provider refused before source effect')
      }
    })
    await failed.accept(target(), input(), 'failed')
    await failed.tick()
    expect(failed.status(agentContextTransitionSourceOf(target()), 'failed')).toMatchObject({
      status: 'failed',
      errorCode: 'provider_preparation_failed'
    })

    const uncertainTarget = target('generation-uncertain')
    const uncertain = serviceFor(new AgentContextTransitionStore(join(root, 'uncertain')), {
      execute: async (_request, _revision, control) => {
        expect(await control.markEffectPossible()).toBe(true)
        throw new Error('connection lost after effect became possible')
      }
    })
    await uncertain.accept(uncertainTarget, input(), 'uncertain')
    await uncertain.tick()
    expect(
      uncertain.status(agentContextTransitionSourceOf(uncertainTarget), 'uncertain')
    ).toMatchObject({ status: 'unconfirmed', errorCode: 'execution_outcome_unconfirmed' })
  })

  it('retains a confirmed destination when continuation outcome is unknown', async () => {
    const root = await temporaryDirectory()
    const store = new AgentContextTransitionStore(root)
    let executions = 0
    const service = serviceFor(store, {
      execute: async (_request, _revision, control) => {
        executions++
        expect(await control.markEffectPossible()).toBe(true)
        await control.recordResult(result)
        throw new Error('agent_context_continuation_unconfirmed')
      }
    })
    await service.accept(target(), input(), 'request-1')
    await service.tick()

    expect(service.status(agentContextTransitionSourceOf(target()), 'request-1')).toMatchObject({
      status: 'unconfirmed',
      errorCode: 'agent_context_continuation_unconfirmed',
      result
    })
    expect(
      service.listConversation({
        workspaceId: target().workspaceId,
        providerSessionId: result.newProviderSessionId
      })
    ).toHaveLength(1)
    await store.settled()

    const restored = serviceFor(new AgentContextTransitionStore(root), {
      execute: async () => {
        executions++
        return result
      }
    })
    await restored.tick()
    expect(executions).toBe(1)
    expect(
      restored.listConversation({
        workspaceId: target().workspaceId,
        providerSessionId: result.newProviderSessionId
      })[0]
    ).toMatchObject({ status: 'unconfirmed', result })
  })

  it('enforces workspace-wide cooldown across successor source generations', async () => {
    const root = await temporaryDirectory()
    let now = Date.parse('2026-09-23T10:00:00.000Z')
    const store = new AgentContextTransitionStore(root, { now: () => now })
    const service = serviceFor(store, { now: () => now, cooldownMs: 300_000 })
    await service.accept(target(), input(), 'request-1')
    await service.tick()

    const successor = target('generation-2')
    await expect(service.accept(successor, input(), 'request-2')).rejects.toThrow(
      'agent_context_transition_cooldown'
    )
    now += 300_001
    await expect(service.accept(successor, input(), 'request-2')).resolves.toMatchObject({
      status: 'queued'
    })
  })

  it('lists successor history and cancels only through the matching conversation scope', async () => {
    const store = new AgentContextTransitionStore(await temporaryDirectory())
    const service = serviceFor(store, { cooldownMs: 0 })
    await service.accept(target(), input(), 'request-1')
    await service.tick()
    const successor = {
      ...target('generation-2'),
      providerSessionId: result.newProviderSessionId,
      turnId: 'turn-2'
    }
    await service.accept(successor, input(), 'request-2')

    expect(
      service.listConversation({
        workspaceId: successor.workspaceId,
        providerSessionId: successor.providerSessionId
      })
    ).toHaveLength(2)
    await expect(
      service.cancelConversation(
        { workspaceId: successor.workspaceId, providerSessionId: successor.providerSessionId },
        'request-2'
      )
    ).resolves.toMatchObject({ status: 'cancelled' })
    await expect(
      service.cancelConversation(
        { workspaceId: 'other-workspace', providerSessionId: successor.providerSessionId },
        'request-1'
      )
    ).resolves.toBeNull()
  })

  it('cancels queued work if runtime policy is disabled', async () => {
    const store = new AgentContextTransitionStore(await temporaryDirectory())
    let policy: 'all' | 'off' = 'all'
    const service = serviceFor(store, { policy: () => policy })
    await service.accept(target(), input(), 'request-1')
    policy = 'off'

    await service.tick()

    expect(service.status(agentContextTransitionSourceOf(target()), 'request-1')).toMatchObject({
      status: 'cancelled',
      errorCode: 'policy_changed'
    })
  })

  it('does not publish an accepted request when durable persistence fails', async () => {
    const root = await temporaryDirectory()
    const blockedDirectory = join(root, 'not-a-directory')
    await writeFile(blockedDirectory, 'file')
    const store = new AgentContextTransitionStore(blockedDirectory)
    const service = serviceFor(store)

    await expect(service.accept(target(), input(), 'request-1')).rejects.toThrow()
    expect(service.status(agentContextTransitionSourceOf(target()), 'request-1')).toBeNull()
  })

  it('prunes old terminal records but never evicts active work at its bound', async () => {
    const store = new AgentContextTransitionStore(await temporaryDirectory(), { maxRequests: 1 })
    const service = serviceFor(store, { cooldownMs: 0 })
    await service.accept(target(), input(), 'request-1')
    await service.cancel(agentContextTransitionSourceOf(target()), 'request-1')
    const second = target('generation-2')
    await service.accept(second, input(), 'request-2')
    expect(service.status(agentContextTransitionSourceOf(target()), 'request-1')).toBeNull()

    await expect(service.accept(target('generation-3'), input(), 'request-3')).rejects.toThrow(
      'agent_context_transition_store_full'
    )
    expect(service.status(agentContextTransitionSourceOf(second), 'request-2')?.status).toBe(
      'queued'
    )
  })
})
