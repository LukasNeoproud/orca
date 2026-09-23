import {
  buildAgentContextHandoff,
  type AgentContextTransitionRequest,
  type AgentContextTransitionExecutionControl,
  type AgentContextTransitionResult
} from '../../shared/agent-context-transition'
import type { CodexContinuationService } from '../codex/codex-continuation-service'
import { getProfileUserDataPath } from '../orca-profiles/profile-storage-paths'
import { AgentContextTransitionService } from './agent-context-transition-service'
import { AgentContextTransitionStore } from './agent-context-transition-store'
import { AgentContextTerminalSurfaceBroker } from './agent-context-terminal-surface'
import { inspectAgentContextBoundary } from './agent-context-boundary'
import { executeAgentContextStructured } from './agent-context-structured-execution'
import { continueAgentContextTerminal } from './agent-context-terminal-continuation'
import { inspectCodexContextSource } from '../codex/codex-continuation-source'
import type { OrcaRuntimeService } from './orca-runtime'

export function createAgentContextRuntime(
  runtime: OrcaRuntimeService,
  continuation: CodexContinuationService
) {
  const surface = new AgentContextTerminalSurfaceBroker()
  const execute = async (
    request: AgentContextTransitionRequest,
    revision: string,
    controls: AgentContextTransitionExecutionControl
  ): Promise<AgentContextTransitionResult> => {
    const source = {
      providerSessionId: request.target.providerSessionId,
      workspaceId: request.target.workspaceId
    }
    if (!(await controls.guard())) {
      throw new Error('agent_context_source_changed')
    }
    const reference =
      request.input.mode === 'fresh'
        ? await continuation.prepareReference({ source, expectedRevision: revision })
        : null
    const handoff =
      request.input.mode === 'fresh'
        ? `${buildAgentContextHandoff(request.input)}\n\n${reference!.reference}`
        : undefined
    const prepared = await continuation.prepareInBackground(
      { source, expectedRevision: revision },
      handoff
    )
    await continuation.settled()
    const candidate = continuation.status(prepared.candidateId)
    if (
      !candidate ||
      candidate.status !== 'ready' ||
      !candidate.providerSessionId ||
      !candidate.transcriptPath
    ) {
      throw new Error(
        candidate?.error && /^agent_context_[a-z_]+$/.test(candidate.error)
          ? candidate.error
          : candidate?.status === 'unconfirmed'
            ? 'agent_context_candidate_unconfirmed'
            : 'agent_context_candidate_unavailable'
      )
    }
    if (!(await controls.guard())) {
      throw new Error('agent_context_source_changed')
    }
    const ready = {
      providerSessionId: candidate.providerSessionId,
      transcriptPath: candidate.transcriptPath
    }
    if (request.target.sessionId) {
      return executeAgentContextStructured(runtime, request, ready, {
        ...controls,
        claimCandidate: async () => {
          await continuation.claim(candidate.candidateId)
        }
      })
    }
    if (!request.target.paneKey) {
      throw new Error('agent_context_surface_unavailable')
    }
    const baseline =
      request.input.continuation === 'continue'
        ? await inspectCodexContextSource({
            ...(await runtime.resolveConversationContinuationSource(source)),
            providerSessionId: ready.providerSessionId,
            transcriptPath: ready.transcriptPath
          })
        : null
    await surface.offer(
      {
        requestId: request.requestId,
        source: {
          paneKey: request.target.paneKey,
          providerSessionId: request.target.providerSessionId,
          sourceGeneration: request.target.sourceGeneration
        },
        mode: request.input.mode === 'compact' ? 'compacted' : 'fresh',
        candidate: ready
      },
      {
        guard: controls.guard,
        markEffectPossible: async () => {
          if (!(await controls.markEffectPossible())) {
            throw new Error('agent_context_source_changed')
          }
          await continuation.claim(candidate.candidateId)
        }
      }
    )
    await controls.recordResult({
      newProviderSessionId: ready.providerSessionId,
      newPaneKey: request.target.paneKey
    })
    const newTerminalHandle = baseline
      ? await continueAgentContextTerminal(
          runtime,
          request,
          ready.providerSessionId,
          baseline.userMessageCount
        )
      : undefined
    return {
      newProviderSessionId: ready.providerSessionId,
      newPaneKey: request.target.paneKey,
      ...(newTerminalHandle ? { newTerminalHandle } : {})
    }
  }
  const transitions = new AgentContextTransitionService({
    store: new AgentContextTransitionStore(getProfileUserDataPath()),
    policy: () => runtime.getConversationContinuationSettings().agentContextAutonomy ?? 'off',
    inspect: (request) => inspectAgentContextBoundary(runtime, request),
    execute
  })
  return { transitions, surface }
}
