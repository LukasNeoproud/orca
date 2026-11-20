import { randomUUID } from 'node:crypto'
import type { EnrichedAgentHookEventPayload } from '../agent-hooks/server/server-types'
import type { StructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-host'
import {
  createQualityGateFeedbackDelivery,
  newQualityGateFeedbackOperationId,
  type QualityGateFeedbackDeliveryRuntime
} from './quality-gate-feedback-delivery'
import {
  createQualityGateFeedbackLoop,
  type QualityGateFeedbackDelivery,
  type QualityGateFeedbackLoop,
  type QualityGateLoopAgent
} from './quality-gate-feedback-loop'
import {
  createQualityGateFeedbackLoopSwitches,
  defaultQualityGateFeedbackLoopSwitchesPath,
  type QualityGateFeedbackLoopSwitches
} from './quality-gate-feedback-loop-switches'
import { getQualityGateChangeFeed, getQualityGateService } from './quality-gate-host'
import { createQualityGateLoopAgentEvents } from './quality-gate-loop-agent-events'
import { resolveQualityGateTarget } from './quality-gate-target'

type LoopRuntime = QualityGateFeedbackDeliveryRuntime &
  Parameters<typeof resolveQualityGateTarget>[0]

/** What the loop reads of the hook server: the same store every other reader subscribes to. */
type AgentStatusSource = {
  subscribeEnrichedStatus(listener: (payload: EnrichedAgentHookEventPayload) => void): () => void
  subscribeStatusDrop(listener: (paneKey: string) => void): () => void
}

let loop: QualityGateFeedbackLoop | null = null
let switches: QualityGateFeedbackLoopSwitches | null = null
let installed: {
  runtime: LoopRuntime
  deliver: ReturnType<typeof createQualityGateFeedbackDelivery>
} | null = null

export function getQualityGateFeedbackLoopSwitches(): QualityGateFeedbackLoopSwitches {
  switches ??= createQualityGateFeedbackLoopSwitches({
    filePath: defaultQualityGateFeedbackLoopSwitchesPath()
  })
  return switches
}

/** The loop of this host process. Until it is installed it only answers for its status. */
export function getQualityGateFeedbackLoop(): QualityGateFeedbackLoop {
  loop ??= createQualityGateFeedbackLoop({
    resolveTarget: (worktreeId) => {
      if (!installed) {
        throw new Error('The quality gate feedback loop is not installed on this host.')
      }
      return resolveQualityGateTarget(installed.runtime, `id:${worktreeId}`)
    },
    service: {
      run: (...args) => getQualityGateService().run(...args),
      output: (...args) => getQualityGateService().output(...args),
      whenIdle: (...args) => getQualityGateService().whenIdle(...args)
    },
    isWorkspaceDisabled: (worktreeId) =>
      getQualityGateFeedbackLoopSwitches().isDisabled(worktreeId),
    deliver: (agent: QualityGateLoopAgent, text: string): Promise<QualityGateFeedbackDelivery> =>
      installed
        ? installed.deliver(agent, text)
        : Promise.resolve({
            kind: 'not-deliverable',
            reason: 'not-deliverable',
            detail: 'no runtime'
          }),
    onChanged: (worktreeId) => getQualityGateChangeFeed().notify(worktreeId),
    newChainId: () => `qg-${randomUUID().slice(0, 8)}`
  })
  return loop
}

/**
 * Starts feeding the loop from the hook server of the host this process is: the desktop app, a
 * headless `orca serve`, or orcad on a machine reached over SSH. Returns the uninstall.
 */
export function installQualityGateFeedbackLoop(
  runtime: LoopRuntime,
  statusSource: AgentStatusSource,
  // Passed in, not imported: orcad serves terminals only and must not bundle the chat host.
  structuredHost: () => StructuredAgentSessionHost | null = () => null
): () => void {
  installed = {
    runtime,
    deliver: createQualityGateFeedbackDelivery({
      runtime,
      structuredHost,
      newOperationId: newQualityGateFeedbackOperationId
    })
  }
  const events = createQualityGateLoopAgentEvents()
  const feedbackLoop = getQualityGateFeedbackLoop()
  const unsubscribeStatus = statusSource.subscribeEnrichedStatus((enriched) => {
    const event = events.observe(enriched)
    if (event) {
      void feedbackLoop.handle(event)
    }
  })
  const unsubscribeDrop = statusSource.subscribeStatusDrop((paneKey) => {
    void feedbackLoop.handle(events.forget(paneKey))
  })
  return () => {
    unsubscribeStatus()
    unsubscribeDrop()
    installed = null
  }
}

/** @internal - tests install a loop and switches over a temp directory. */
export function _setQualityGateFeedbackLoopForTests(
  next: { loop: QualityGateFeedbackLoop; switches: QualityGateFeedbackLoopSwitches } | null
): void {
  loop = next?.loop ?? null
  switches = next?.switches ?? null
}
