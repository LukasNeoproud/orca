import {
  agentSessionFingerprintConflict,
  computeAgentSessionPayloadFingerprint
} from '../../../../shared/agent-session-mutation-envelope'
import {
  buildPreparedAgentSessionBranch,
  samePreparedAgentSessionBranch
} from '../../../native-chat/agent-session-wire/structured-agent-session-branch-service'
import type { RpcContext } from '../core'
import { requireBranchCapability } from './structured-agent-session-branch-gate'
import type { BranchPrepareParams } from './structured-agent-session-branch-schemas'
import {
  commitStructuredAgentSessionCreate,
  prepareStructuredAgentSessionCreateForWorktree
} from './structured-agent-session-create'
import {
  ensureStructuredHostInstalled,
  requireStructuredHost,
  structuredCallerFor
} from './structured-agent-session-gate'
import { resolveUncommittedStructuredCreate } from './structured-agent-session-precommit-refusal'

export async function prepareAgentSessionBranch(
  params: typeof BranchPrepareParams._output,
  ctx: RpcContext
) {
  requireBranchCapability(ctx)
  if (params.sourceSessionId === params.target.create.envelope.sessionId) {
    throw new Error('agent_session_branch_cycle')
  }
  await ensureStructuredHostInstalled(ctx)
  const host = requireStructuredHost(ctx)
  const store = host.deps.branchStore
  if (!store) {
    throw new Error('agent_session_branch_unsupported')
  }
  const createFingerprint = computeAgentSessionPayloadFingerprint({
    method: 'agentSession.create',
    sessionId: params.target.create.envelope.sessionId,
    fields: { worktree: params.target.create.worktree, agent: params.target.create.agent }
  })
  const createConflict = agentSessionFingerprintConflict(
    params.target.create.envelope,
    createFingerprint
  )
  if (createConflict) {
    throw new Error(createConflict.message)
  }
  const persisted = store.get(params.branchId)
  const initialCreate =
    persisted?.providerFork?.targetProviderSessionId && persisted.target.create?.resumeFrom
      ? persisted.target.create
      : params.target.create
  const base = await resolveUncommittedStructuredCreate(() =>
    prepareStructuredAgentSessionCreateForWorktree({
      runtime: ctx.runtime,
      ensureHost: async () => host,
      ...initialCreate,
      caller: structuredCallerFor(ctx)
    })
  )
  if ('refusal' in base) {
    throw new Error(base.refusal.message)
  }
  const candidate = await buildPreparedAgentSessionBranch({
    host,
    params,
    targetLocation: base.attachParams.location
  })
  return store.runExclusive(params.branchId, async () => {
    const existing = store.get(params.branchId)
    if (existing && !samePreparedAgentSessionBranch(existing, candidate)) {
      throw new Error('agent_session_branch_operation_conflict')
    }
    if (existing?.state === 'prepared' || existing?.state === 'started') {
      return { branch: existing }
    }
    if (existing?.state === 'fork-unverified' || existing?.state === 'forking') {
      const unresolved =
        existing.state === 'forking'
          ? await store.put({ ...existing, state: 'fork-unverified', updatedAt: Date.now() })
          : existing
      return { branch: unresolved }
    }
    const completedProviderFork =
      existing?.providerFork?.targetProviderSessionId && existing.target.create?.resumeFrom
    let branch = completedProviderFork
      ? existing
      : existing
        ? { ...candidate, createdAt: existing.createdAt }
        : candidate
    await store.put(branch)
    let prepared = base
    if (completedProviderFork) {
      branch = existing
      prepared = await prepareStructuredAgentSessionCreateForWorktree({
        runtime: ctx.runtime,
        ensureHost: async () => host,
        ...existing.target.create!,
        caller: structuredCallerFor(ctx)
      })
    } else if (branch.providerFork) {
      const providerFork = branch.providerFork
      branch = await store.put({ ...branch, state: 'forking', updatedAt: Date.now() })
      const holder = `branch-fork:${branch.branchId}`
      let held = false
      try {
        await host.hold(branch.source.sessionId, holder, { resume: true })
        held = true
        const fork = await host.forkConversation({
          sourceSessionId: branch.source.sessionId,
          targetSessionId: branch.target.sessionId,
          targetLocation: branch.target.location,
          boundaryItemId: providerFork.boundaryItemId,
          expectedEpoch: branch.source.anchor.epoch
        })
        const resumeFrom = { providerSessionId: fork.providerSessionId }
        const targetCreate = {
          ...params.target.create,
          resumeFrom,
          envelope: {
            ...params.target.create.envelope,
            payloadFingerprint: computeAgentSessionPayloadFingerprint({
              method: 'agentSession.create',
              sessionId: params.target.create.envelope.sessionId,
              fields: {
                worktree: params.target.create.worktree,
                agent: params.target.create.agent,
                resumeFrom
              }
            })
          }
        }
        branch = await store.put({
          ...branch,
          state: 'preparing',
          target: { ...branch.target, create: targetCreate },
          providerFork: { ...providerFork, targetProviderSessionId: fork.providerSessionId },
          updatedAt: Date.now()
        })
        prepared = await prepareStructuredAgentSessionCreateForWorktree({
          runtime: ctx.runtime,
          ensureHost: async () => host,
          ...targetCreate,
          caller: structuredCallerFor(ctx)
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          branch: await store.put({
            ...branch,
            state: branch.providerFork?.targetProviderSessionId ? 'preparing' : 'fork-unverified',
            error: message.slice(0, 4096),
            updatedAt: Date.now()
          })
        }
      } finally {
        if (held) {
          host.release(branch.source.sessionId, holder)
        }
      }
    }
    const created = await commitStructuredAgentSessionCreate({
      runtime: ctx.runtime,
      caller: structuredCallerFor(ctx),
      prepared,
      activate: false
    })
    branch = created.ok
      ? { ...branch, state: 'prepared', error: null, updatedAt: Date.now() }
      : { ...branch, state: 'failed', error: created.refusal.message, updatedAt: Date.now() }
    return { branch: await store.put(branch) }
  })
}
