import type { AgentSessionBranchStore } from '../runtime/agent-session-branch-store'
import type {
  PortableConversationBranchBeginStartParams,
  PortableConversationBranchBeginStartResult,
  PortableConversationBranchCompleteStartParams,
  PortableConversationBranchRecord,
  PortableConversationBranchesResult,
  PortableConversationTerminalReceipt
} from '../../shared/portable-conversation-branch'
import {
  portableConversationSourceSessionId,
  portableConversationTerminalSessionId
} from '../../shared/portable-conversation-branch'
import { isPortableConversationBranchRecord } from './portable-conversation-branch-service'

export async function beginPortableConversationBranchStart(
  store: AgentSessionBranchStore,
  params: PortableConversationBranchBeginStartParams,
  now = Date.now()
): Promise<PortableConversationBranchBeginStartResult> {
  return store.runExclusive(`start:${params.branchId}`, async () => {
    const branch = requirePortableBranch(store, params.branchId)
    const delivery = branch.delivery
    if (delivery?.status === 'accepted') {
      if (delivery.clientMessageId !== params.attemptId) {
        throw new Error('portable_conversation_branch_already_started')
      }
      return { branch, authorized: false }
    }
    if (delivery?.status === 'pending' || delivery?.status === 'unknown') {
      if (delivery.clientMessageId !== params.attemptId) {
        throw new Error('portable_conversation_branch_delivery_in_flight')
      }
      return { branch, authorized: false }
    }
    const next: PortableConversationBranchRecord = {
      ...branch,
      target: {
        ...branch.target,
        terminal: {
          ...branch.target.terminal,
          launch: { attemptId: params.attemptId, status: 'pending', receipt: null, reason: null }
        }
      },
      state: 'starting',
      delivery: pendingDelivery(params.attemptId, now),
      error: null,
      updatedAt: now
    }
    return {
      branch: (await store.put(next)) as PortableConversationBranchRecord,
      authorized: true
    }
  })
}

export async function completePortableConversationBranchStart(
  store: AgentSessionBranchStore,
  params: PortableConversationBranchCompleteStartParams,
  now = Date.now()
): Promise<PortableConversationBranchRecord> {
  return store.runExclusive(`start:${params.branchId}`, async () => {
    const branch = requirePortableBranch(store, params.branchId)
    const launch = branch.target.terminal.launch
    if (!launch || launch.attemptId !== params.attemptId) {
      throw new Error('portable_conversation_branch_attempt_mismatch')
    }
    if (
      params.outcome.kind === 'launched' &&
      params.outcome.receipt.launchAgent &&
      params.outcome.receipt.launchAgent !== branch.target.agent
    ) {
      throw new Error('portable_conversation_branch_target_mismatch')
    }
    if (launch.status !== 'pending') {
      if (params.outcome.kind !== 'launched' || launch.status === 'rejected') {
        return branch
      }
      const status = params.outcome.acknowledged ? 'accepted' : launch.status
      const enriched: PortableConversationBranchRecord = {
        ...branch,
        target: {
          ...branch.target,
          terminal: {
            ...branch.target.terminal,
            launch: {
              ...launch,
              status,
              receipt: mergeReceipt(launch.receipt, params.outcome.receipt)
            }
          }
        },
        state: status === 'accepted' ? 'started' : branch.state,
        delivery: branch.delivery ? { ...branch.delivery, status } : branch.delivery,
        updatedAt: now
      }
      return (await store.put(enriched)) as PortableConversationBranchRecord
    }
    const outcome = params.outcome
    const launched = outcome.kind === 'launched'
    const status = launched ? (outcome.acknowledged ? 'accepted' : 'unknown') : 'rejected'
    const reason = launched ? null : outcome.reason
    const next: PortableConversationBranchRecord = {
      ...branch,
      target: {
        ...branch.target,
        terminal: {
          ...branch.target.terminal,
          launch: {
            attemptId: params.attemptId,
            status,
            receipt: launched ? outcome.receipt : null,
            reason
          }
        }
      },
      state:
        status === 'accepted' ? 'started' : status === 'unknown' ? 'delivery-unverified' : 'failed',
      delivery: {
        clientMessageId: params.attemptId,
        status,
        reason,
        submittedAt: branch.delivery?.submittedAt ?? now,
        resolvedAt: now
      },
      error: reason,
      updatedAt: now
    }
    return (await store.put(next)) as PortableConversationBranchRecord
  })
}

function mergeReceipt(
  current: PortableConversationTerminalReceipt | null,
  update: PortableConversationTerminalReceipt
): PortableConversationTerminalReceipt {
  if (!current) {
    return update
  }
  const providerSession = mergeProviderSession(current.providerSession, update.providerSession)
  const history = mergeHistory(current.history, update.history)
  return {
    tabId: current.tabId,
    ...((current.leafId ?? update.leafId) ? { leafId: current.leafId ?? update.leafId } : {}),
    ...((current.paneKey ?? update.paneKey) ? { paneKey: current.paneKey ?? update.paneKey } : {}),
    ...((current.ptyId ?? update.ptyId) ? { ptyId: current.ptyId ?? update.ptyId } : {}),
    ...((current.launchAgent ?? update.launchAgent)
      ? { launchAgent: current.launchAgent ?? update.launchAgent }
      : {}),
    ...(providerSession ? { providerSession } : {}),
    ...(history ? { history } : {})
  }
}

function mergeProviderSession(
  current: PortableConversationTerminalReceipt['providerSession'],
  update: PortableConversationTerminalReceipt['providerSession']
) {
  if (!current || !update) {
    return current ?? update
  }
  if (current.key !== update.key || current.id !== update.id) {
    throw new Error('portable_conversation_branch_provider_mismatch')
  }
  if (
    current.transcriptPath &&
    update.transcriptPath &&
    current.transcriptPath !== update.transcriptPath
  ) {
    throw new Error('portable_conversation_branch_provider_mismatch')
  }
  return {
    ...current,
    ...((current.transcriptPath ?? update.transcriptPath)
      ? { transcriptPath: current.transcriptPath ?? update.transcriptPath }
      : {})
  }
}

function mergeHistory(
  current: PortableConversationTerminalReceipt['history'],
  update: PortableConversationTerminalReceipt['history']
) {
  if (!current || !update) {
    return current ?? update
  }
  if (current.filePath !== update.filePath) {
    throw new Error('portable_conversation_branch_provider_mismatch')
  }
  return {
    filePath: current.filePath,
    ...((current.codexHome ?? update.codexHome)
      ? { codexHome: current.codexHome ?? update.codexHome }
      : {}),
    ...((current.cwd ?? update.cwd) ? { cwd: current.cwd ?? update.cwd } : {})
  }
}

export function portableConversationBranchFamily(
  store: AgentSessionBranchStore,
  sessionId: string
): PortableConversationBranchesResult {
  const portable = store.allBranches().filter(isPortableConversationBranchRecord)
  const family = new Set([sessionId])
  let changed = true
  while (changed) {
    changed = false
    for (const branch of portable) {
      const ids = branchSessionAliases(branch)
      if (!ids.some((id) => family.has(id))) {
        continue
      }
      for (const id of ids) {
        if (!family.has(id)) {
          family.add(id)
          changed = true
        }
      }
    }
  }
  const branches = portable.filter((branch) =>
    branchSessionAliases(branch).some((id) => family.has(id))
  )
  const branchIds = new Set(branches.map((branch) => branch.branchId))
  const returns = branches
    .flatMap((branch) => store.returnsFor(branch.source.sessionId))
    .filter((result, index, all) => branchIds.has(result.branchId) && all.indexOf(result) === index)
    .filter((result) => 'portable' in result)
  return { branches, returns: returns as PortableConversationBranchesResult['returns'] }
}

function branchSessionAliases(branch: PortableConversationBranchRecord): string[] {
  const receipt = branch.target.terminal.launch?.receipt
  const providerSession = receipt?.providerSession
  const alias = providerSession
    ? portableConversationTerminalSessionId({
        executionHostId: branch.target.terminal.workspace.executionHostId,
        agent: branch.target.agent,
        providerSession,
        ...(receipt.history ? { history: receipt.history } : {})
      })
    : null
  const existingAlias = branch.target.terminal.existingSource
    ? portableConversationSourceSessionId(branch.target.terminal.existingSource)
    : null
  return [
    branch.source.sessionId,
    branch.target.sessionId,
    ...(alias ? [alias] : []),
    ...(existingAlias ? [existingAlias] : [])
  ]
}

function requirePortableBranch(
  store: AgentSessionBranchStore,
  branchId: string
): PortableConversationBranchRecord {
  const branch = store.get(branchId)
  if (!branch) {
    throw new Error('portable_conversation_branch_missing')
  }
  if (!isPortableConversationBranchRecord(branch)) {
    throw new Error('portable_conversation_branch_kind_mismatch')
  }
  return branch
}

function pendingDelivery(attemptId: string, now: number) {
  return {
    clientMessageId: attemptId,
    status: 'pending' as const,
    reason: null,
    submittedAt: now,
    resolvedAt: null
  }
}
