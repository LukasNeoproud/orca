import type { AgentStatusState } from '../../../../shared/agent-status-types'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import {
  promptsMatchSession,
  resolveOriginalPaneTarget,
  type OriginalPaneState,
  type AiVaultOriginalPaneTarget
} from './ai-vault-original-pane'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'

type LiveEntry = NonNullable<OriginalPaneState['agentStatusByPaneKey'][string]>
type RetainedEntry = NonNullable<OriginalPaneState['retainedAgentsByPaneKey'][string]>
type SleepingEntry = NonNullable<OriginalPaneState['sleepingAgentSessionsByPaneKey'][string]>

type ProviderIndex<T> = Map<string, T[]>
type AgentIndex<T> = Map<string, T[]>

export type AiVaultOriginalPaneIndex = {
  state: OriginalPaneState
  liveByProvider: ProviderIndex<LiveEntry>
  liveWithoutProviderByAgent: AgentIndex<LiveEntry>
  retainedByProvider: ProviderIndex<RetainedEntry>
  retainedWithoutProviderByAgent: AgentIndex<RetainedEntry>
  sleepingByProvider: ProviderIndex<SleepingEntry>
}

let lastIndexInput: OriginalPaneState | null = null
let lastIndex: AiVaultOriginalPaneIndex | null = null

function originalPaneStateMatches(left: OriginalPaneState, right: OriginalPaneState): boolean {
  return (
    left.agentStatusByPaneKey === right.agentStatusByPaneKey &&
    left.retainedAgentsByPaneKey === right.retainedAgentsByPaneKey &&
    left.sleepingAgentSessionsByPaneKey === right.sleepingAgentSessionsByPaneKey &&
    left.tabsByWorktree === right.tabsByWorktree &&
    left.terminalLayoutsByTabId === right.terminalLayoutsByTabId &&
    left.repos === right.repos &&
    left.settings === right.settings &&
    left.worktreesByRepo === right.worktreesByRepo &&
    left.detectedWorktreesByRepo === right.detectedWorktreesByRepo &&
    left.folderWorkspaces === right.folderWorkspaces &&
    left.projectGroups === right.projectGroups &&
    left.restoredRuntimeHostIdByWorkspaceSessionKey ===
      right.restoredRuntimeHostIdByWorkspaceSessionKey &&
    left.activeWorktreeId === right.activeWorktreeId &&
    left.activeWorkspaceExecutionHostId === right.activeWorkspaceExecutionHostId &&
    left.runtimeEnvironments === right.runtimeEnvironments &&
    left.runtimeEnvironmentCatalogHydrated === right.runtimeEnvironmentCatalogHydrated &&
    left.removedRuntimeEnvironmentIds === right.removedRuntimeEnvironmentIds
  )
}

function providerKey(executionHostId: string, agent: string, sessionId: string): string {
  // Why: unlike punctuation delimiters, NUL cannot collide with agent or
  // provider-session text, so distinct identity pairs stay distinct keys.
  return `${executionHostId}\u0000${agent}\u0000${sessionId}`
}

function agentKey(executionHostId: string, agent: string): string {
  return `${executionHostId}\u0000${agent}`
}

function entryExecutionHostId(state: OriginalPaneState, worktreeId: string | undefined): string {
  return getExecutionHostIdForWorktree(state, worktreeId)
}

function appendToIndex<T>(index: Map<string, T[]>, key: string, value: T): void {
  const entries = index.get(key)
  if (entries) {
    entries.push(value)
  } else {
    index.set(key, [value])
  }
}

export function buildAiVaultOriginalPaneIndex(state: OriginalPaneState): AiVaultOriginalPaneIndex {
  const liveByProvider: ProviderIndex<LiveEntry> = new Map()
  const liveWithoutProviderByAgent: AgentIndex<LiveEntry> = new Map()
  const retainedByProvider: ProviderIndex<RetainedEntry> = new Map()
  const retainedWithoutProviderByAgent: AgentIndex<RetainedEntry> = new Map()
  const sleepingByProvider: ProviderIndex<SleepingEntry> = new Map()

  for (const entry of Object.values(state.agentStatusByPaneKey)) {
    if (!entry?.agentType) {
      continue
    }
    const hostId = entryExecutionHostId(state, entry.worktreeId)
    if (entry.providerSession) {
      appendToIndex(
        liveByProvider,
        providerKey(hostId, entry.agentType, entry.providerSession.id),
        entry
      )
    } else if (entry.providerSession === undefined) {
      appendToIndex(liveWithoutProviderByAgent, agentKey(hostId, entry.agentType), entry)
    }
  }
  for (const retained of Object.values(state.retainedAgentsByPaneKey)) {
    if (!retained?.agentType) {
      continue
    }
    const hostId = entryExecutionHostId(state, retained.worktreeId)
    if (retained.entry.providerSession) {
      appendToIndex(
        retainedByProvider,
        providerKey(hostId, retained.agentType, retained.entry.providerSession.id),
        retained
      )
    } else if (retained.entry.providerSession === undefined) {
      appendToIndex(retainedWithoutProviderByAgent, agentKey(hostId, retained.agentType), retained)
    }
  }
  for (const record of Object.values(state.sleepingAgentSessionsByPaneKey)) {
    if (record) {
      appendToIndex(
        sleepingByProvider,
        providerKey(
          entryExecutionHostId(state, record.worktreeId),
          record.agent,
          record.providerSession.id
        ),
        record
      )
    }
  }

  return {
    state,
    liveByProvider,
    liveWithoutProviderByAgent,
    retainedByProvider,
    retainedWithoutProviderByAgent,
    sleepingByProvider
  }
}

export function getAiVaultOriginalPaneIndex(state: OriginalPaneState): AiVaultOriginalPaneIndex {
  if (lastIndexInput && lastIndex && originalPaneStateMatches(lastIndexInput, state)) {
    return lastIndex
  }
  lastIndexInput = state
  lastIndex = buildAiVaultOriginalPaneIndex(state)
  return lastIndex
}

export function createLazyAiVaultOriginalPaneIndex(
  state: OriginalPaneState
): () => AiVaultOriginalPaneIndex {
  let index: AiVaultOriginalPaneIndex | null = null
  return () => {
    index ??= getAiVaultOriginalPaneIndex(state)
    return index
  }
}

export function findOriginalAiVaultSessionPaneInIndex(
  index: AiVaultOriginalPaneIndex,
  session: AiVaultSession
): AiVaultOriginalPaneTarget | null {
  const key = providerKey(session.executionHostId, session.agent, session.sessionId)
  const fallbackKey = agentKey(session.executionHostId, session.agent)
  const promptMatchedTargets: AiVaultOriginalPaneTarget[] = []

  for (const entry of index.liveByProvider.get(key) ?? []) {
    const target = resolveOriginalPaneTarget({
      state: index.state,
      paneKey: entry.paneKey,
      worktreeIdHint: entry.worktreeId,
      tabIdHint: entry.tabId
    })
    if (target) {
      return target
    }
  }
  for (const entry of index.liveWithoutProviderByAgent.get(fallbackKey) ?? []) {
    if (!promptsMatchSession(session, entry)) {
      continue
    }
    const target = resolveOriginalPaneTarget({
      state: index.state,
      paneKey: entry.paneKey,
      worktreeIdHint: entry.worktreeId,
      tabIdHint: entry.tabId
    })
    if (target) {
      promptMatchedTargets.push(target)
    }
  }
  for (const retained of index.retainedByProvider.get(key) ?? []) {
    const target = resolveOriginalPaneTarget({
      state: index.state,
      paneKey: retained.entry.paneKey,
      worktreeIdHint: retained.worktreeId,
      tabIdHint: retained.entry.tabId ?? retained.tab.id
    })
    if (target) {
      return target
    }
  }
  for (const retained of index.retainedWithoutProviderByAgent.get(fallbackKey) ?? []) {
    if (!promptsMatchSession(session, retained.entry)) {
      continue
    }
    const target = resolveOriginalPaneTarget({
      state: index.state,
      paneKey: retained.entry.paneKey,
      worktreeIdHint: retained.worktreeId,
      tabIdHint: retained.entry.tabId ?? retained.tab.id
    })
    if (target) {
      promptMatchedTargets.push(target)
    }
  }
  for (const record of index.sleepingByProvider.get(key) ?? []) {
    const target = resolveOriginalPaneTarget({
      state: index.state,
      paneKey: record.paneKey,
      worktreeIdHint: record.worktreeId,
      tabIdHint: record.tabId
    })
    if (target) {
      return target
    }
  }

  return promptMatchedTargets.length === 1 ? promptMatchedTargets[0] : null
}

/** Only panes still represented by the live agent-status index. */
export function findRunningOriginalAiVaultSessionPaneInIndex(
  index: AiVaultOriginalPaneIndex,
  session: AiVaultSession
): AiVaultOriginalPaneTarget | null {
  const key = providerKey(session.executionHostId, session.agent, session.sessionId)
  const fallbackKey = agentKey(session.executionHostId, session.agent)
  for (const entry of index.liveByProvider.get(key) ?? []) {
    const target = resolveOriginalPaneTarget({
      state: index.state,
      paneKey: entry.paneKey,
      worktreeIdHint: entry.worktreeId,
      tabIdHint: entry.tabId
    })
    if (target) {
      return target
    }
  }
  const promptMatches: AiVaultOriginalPaneTarget[] = []
  for (const entry of index.liveWithoutProviderByAgent.get(fallbackKey) ?? []) {
    if (!promptsMatchSession(session, entry)) {
      continue
    }
    const target = resolveOriginalPaneTarget({
      state: index.state,
      paneKey: entry.paneKey,
      worktreeIdHint: entry.worktreeId,
      tabIdHint: entry.tabId
    })
    if (target) {
      promptMatches.push(target)
    }
  }
  return promptMatches.length === 1 ? promptMatches[0] : null
}

export function findAiVaultSessionLiveStateInIndex(
  index: AiVaultOriginalPaneIndex,
  session: AiVaultSession
): AgentStatusState | null {
  const direct = index.liveByProvider.get(
    providerKey(session.executionHostId, session.agent, session.sessionId)
  )
  if (direct?.[0]) {
    return direct[0].state
  }
  const promptMatchedStates: AgentStatusState[] = []
  for (const entry of index.liveWithoutProviderByAgent.get(
    agentKey(session.executionHostId, session.agent)
  ) ?? []) {
    if (promptsMatchSession(session, entry)) {
      promptMatchedStates.push(entry.state)
    }
  }
  return promptMatchedStates.length === 1 ? promptMatchedStates[0] : null
}
