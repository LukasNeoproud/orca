import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { makePaneKey } from '../../shared/stable-pane-id'
import { agentSessionProviderHandleChainHead } from '../../shared/agent-session-provider-handle'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'
import type { OrcaRuntimeService } from './orca-runtime'

const Identifier = z.string().min(1).max(512)
export const AgentContextCallerSchema = z.union([
  z.object({ sessionId: Identifier, spawnToken: Identifier }).strict(),
  z.object({ terminalHandle: Identifier, paneKey: Identifier }).strict()
])
export type AgentContextCaller = z.infer<typeof AgentContextCallerSchema>
export type AgentContextBinding = {
  workspaceId: string
  providerSessionId: string
  sourceGeneration: string
  sessionId?: string
  terminalHandle?: string
  paneKey?: string
}

function tokenMatches(expected: string | undefined, actual: string): boolean {
  return Boolean(
    expected &&
    Buffer.byteLength(expected) === Buffer.byteLength(actual) &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  )
}

export async function resolveAgentContextBinding(
  runtime: OrcaRuntimeService,
  caller: AgentContextCaller
): Promise<AgentContextBinding> {
  if ('sessionId' in caller) {
    const host = getStructuredAgentSessionHost()
    const record = host?.deps.store.getRecord(caller.sessionId)
    if (
      !record ||
      record.provider !== 'codex' ||
      record.lease.runtimeKind !== 'native' ||
      record.lease.claimStatus !== 'live' ||
      record.lease.unreconciled ||
      !tokenMatches(record.lease.ownerProcess?.spawnToken, caller.spawnToken)
    ) {
      throw new Error('agent_context_caller_unverified')
    }
    const head = agentSessionProviderHandleChainHead(record.providerHandleChain)
    if (
      record.location.executionHostId !== 'local' ||
      record.location.wslDistro ||
      head?.handle.provider !== 'codex'
    ) {
      throw new Error('agent_context_host_unsupported')
    }
    return {
      workspaceId: record.location.workspaceId,
      providerSessionId: head.handle.threadId,
      sourceGeneration: `native:${record.lease.runtimeFence}`,
      sessionId: caller.sessionId
    }
  }
  const terminal = await runtime.showTerminal(caller.terminalHandle)
  if (
    !terminal.connected ||
    !terminal.ptyId ||
    !terminal.incarnationId ||
    makePaneKey(terminal.tabId, terminal.leafId) !== caller.paneKey
  ) {
    throw new Error('agent_context_caller_unverified')
  }
  const status = runtime.getAgentContextPaneSnapshot(caller.paneKey)
  if (status?.agentType !== 'codex' || !status.providerSession?.id) {
    throw new Error('agent_context_provider_unsupported')
  }
  const source = { workspaceId: terminal.worktreeId, providerSessionId: status.providerSession.id }
  await runtime.resolveConversationContinuationSource(source)
  return {
    ...source,
    sourceGeneration: terminal.incarnationId,
    terminalHandle: caller.terminalHandle,
    paneKey: caller.paneKey
  }
}

export async function agentContextBindingIsCurrent(
  runtime: OrcaRuntimeService,
  binding: AgentContextBinding
): Promise<boolean> {
  if (binding.sessionId) {
    const record = getStructuredAgentSessionHost()?.deps.store.getRecord(binding.sessionId)
    const head = record && agentSessionProviderHandleChainHead(record.providerHandleChain)
    return Boolean(
      record &&
      record.location.executionHostId === 'local' &&
      !record.location.wslDistro &&
      record.location.workspaceId === binding.workspaceId &&
      record.lease.claimStatus === 'live' &&
      !record.lease.unreconciled &&
      `native:${record.lease.runtimeFence}` === binding.sourceGeneration &&
      head?.handle.provider === 'codex' &&
      head.handle.threadId === binding.providerSessionId
    )
  }
  if (!binding.terminalHandle || !binding.paneKey) {
    return false
  }
  const terminal = await runtime.showTerminal(binding.terminalHandle)
  return (
    terminal.connected &&
    terminal.incarnationId === binding.sourceGeneration &&
    terminal.worktreeId === binding.workspaceId &&
    makePaneKey(terminal.tabId, terminal.leafId) === binding.paneKey &&
    runtime.getAgentContextPaneSnapshot(binding.paneKey)?.providerSession?.id ===
      binding.providerSessionId
  )
}
