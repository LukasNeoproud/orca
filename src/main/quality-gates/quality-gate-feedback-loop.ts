import { errorMessage } from '../../shared/error-message'
import type {
  QualityGateFeedbackLoopState,
  QualityGateFeedbackLoopStatus,
  QualityGateFeedbackLoopStopReason
} from '../../shared/quality-gate-feedback-loop'
import {
  buildQualityGateFeedbackPrompt,
  qualityGateFailureImproved,
  qualityGateFailureSignature,
  qualityGateFeedbackMarker,
  type QualityGateFeedbackFailure
} from './quality-gate-feedback-prompt'
import type {
  QualityGateFeedbackDelivery,
  QualityGateLoopAgent,
  QualityGateLoopAgentEvent
} from './quality-gate-loop-agent'
import { collectQualityGateFailures, gateStartStopReason } from './quality-gate-run-failures'
import type { QualityGateService } from './quality-gate-service'
import type { QualityGateTarget } from './quality-gate-target'

export type {
  QualityGateFeedbackDelivery,
  QualityGateLoopAgent,
  QualityGateLoopAgentEvent
} from './quality-gate-loop-agent'

export type QualityGateFeedbackLoopDeps = {
  /** Throws for a workspace this host does not own; the loop then does nothing for it. */
  resolveTarget: (worktreeId: string) => Promise<QualityGateTarget>
  service: Pick<QualityGateService, 'run' | 'output' | 'whenIdle'>
  isWorkspaceDisabled: (worktreeId: string) => boolean
  deliver: (agent: QualityGateLoopAgent, text: string) => Promise<QualityGateFeedbackDelivery>
  /** Told after every change of a loop, so subscribers of the gate status read it again. */
  onChanged: (worktreeId: string) => void
  newChainId: () => string
}

type Chain = {
  state: QualityGateFeedbackLoopState
  chainId: string
  paneKey: string | null
  round: number
  stopReason?: QualityGateFeedbackLoopStopReason
  failingGateIds: string[]
  lastFailure: string | null
  /** Marker of the last message sent in this chain. */
  lastMarker: string | null
  /** A message was sent and no turn has been seen starting since. */
  pendingTurn: boolean
  /** The message being delivered right now: its turn can start before the delivery returns. */
  outgoing: { marker: string; turnSeen: boolean; named: boolean } | null
  /** A turn began after the failures were left to the user, so the agent was given new work. */
  resumed: boolean
  /** Bumped by every stop, so a check in flight learns its verdict is no longer wanted. */
  generation: number
}

const ACTIVE: ReadonlySet<QualityGateFeedbackLoopState> = new Set(['checking', 'awaiting-agent'])

export type QualityGateFeedbackLoop = ReturnType<typeof createQualityGateFeedbackLoop>

/**
 * Runs the required gates when an agent finishes a step and sends the failures back to it. One
 * chain per worktree: the agent that started it owns it until it passes, stops or is handed to
 * the user. Reads agent state from the events it is given and keeps no copy of it.
 */
export function createQualityGateFeedbackLoop(deps: QualityGateFeedbackLoopDeps) {
  const chains = new Map<string, Chain>()
  const inFlight = new Map<string, Promise<void>>()
  const queued = new Map<string, QualityGateLoopAgent>()
  /** Worktrees whose check in flight was called off, so its verdict will be dropped. */
  const calledOff = new Set<string>()

  function settle(
    worktreeId: string,
    chain: Chain,
    state: QualityGateFeedbackLoopState,
    stopReason?: QualityGateFeedbackLoopStopReason
  ): void {
    chain.state = state
    chain.stopReason = stopReason
    chain.pendingTurn = state === 'awaiting-agent' && chain.pendingTurn
    deps.onChanged(worktreeId)
  }

  function stop(worktreeId: string, reason: QualityGateFeedbackLoopStopReason): void {
    const chain = chains.get(worktreeId)
    if (!chain || !ACTIVE.has(chain.state)) {
      return
    }
    chain.generation += 1
    if (inFlight.has(worktreeId)) {
      calledOff.add(worktreeId)
    }
    settle(worktreeId, chain, 'stopped', reason)
  }

  async function check(
    worktreeId: string,
    agent: QualityGateLoopAgent,
    target: QualityGateTarget,
    chain: Chain
  ): Promise<void> {
    const generation = chain.generation
    const current = (): boolean =>
      chains.get(worktreeId) === chain && chain.generation === generation
    let failures: QualityGateFeedbackFailure[] | 'gates-inconclusive' | 'run-refused'
    try {
      const required = target.gates.filter((gate) => gate.required).map((gate) => gate.id)
      const started = deps.service.run(target, required, { kind: 'feedback-loop' })
      failures = await collectQualityGateFailures(
        deps.service,
        target,
        started.runs.map(({ run }) => run.id)
      )
    } catch (error) {
      console.warn('[quality-gates] feedback loop could not run the gates:', errorMessage(error))
      failures = gateStartStopReason(error)
    }
    if (!current()) {
      return
    }
    if (typeof failures === 'string') {
      settle(worktreeId, chain, 'stopped', failures)
      return
    }
    chain.failingGateIds = failures.map((failure) => failure.run.gateId)
    if (failures.length === 0) {
      settle(worktreeId, chain, 'passed')
      return
    }
    const signature = qualityGateFailureSignature(failures)
    const previous = chain.lastFailure
    chain.lastFailure = signature
    // Fewer failing gates, or the same number failing differently, counts as movement.
    if (previous !== null && chain.round > 0 && !qualityGateFailureImproved(previous, signature)) {
      settle(worktreeId, chain, 'needs-user', 'no-improvement')
      return
    }
    if (chain.round >= target.feedbackLoop.maxRounds) {
      settle(worktreeId, chain, 'needs-user', 'round-limit')
      return
    }
    const round = chain.round + 1
    const marker = qualityGateFeedbackMarker(chain.chainId, round)
    let delivery: QualityGateFeedbackDelivery
    const outgoing = (chain.outgoing = { marker, turnSeen: false, named: false })
    try {
      delivery = await deps.deliver(
        agent,
        buildQualityGateFeedbackPrompt({
          marker,
          round,
          maxRounds: target.feedbackLoop.maxRounds,
          failures
        })
      )
    } catch (error) {
      delivery = { kind: 'not-deliverable', reason: 'not-deliverable', detail: errorMessage(error) }
    }
    // One check per worktree at a time, so the slot is still this delivery's.
    chain.outgoing = null
    if (!current()) {
      return
    }
    // A turn that names the marker proves the message arrived, whatever the delivery reports.
    if (delivery.kind === 'not-deliverable' && !outgoing.named) {
      if (outgoing.turnSeen) {
        // Nothing was sent, so the turn that began meanwhile is the user's.
        stop(worktreeId, 'user-message')
        return
      }
      console.warn(`[quality-gates] feedback was not sent to the agent: ${delivery.detail}`)
      settle(worktreeId, chain, 'needs-user', delivery.reason)
      return
    }
    chain.round = round
    chain.lastMarker = marker
    chain.pendingTurn = !outgoing.turnSeen
    settle(worktreeId, chain, 'awaiting-agent')
  }

  async function onStepCompleted(worktreeId: string, agent: QualityGateLoopAgent): Promise<void> {
    let target: QualityGateTarget
    try {
      target = await deps.resolveTarget(worktreeId)
    } catch {
      return
    }
    const existing = chains.get(worktreeId)
    // A chain in progress belongs to the agent that started it.
    if (existing?.state === 'awaiting-agent' && existing.paneKey !== agent.paneKey) {
      return
    }
    // Left to the user: the same agent gets nothing more until somebody starts a turn in it.
    if (
      existing?.state === 'needs-user' &&
      existing.paneKey === agent.paneKey &&
      !existing.resumed
    ) {
      return
    }
    if (!target.feedbackLoop.enabled || deps.isWorkspaceDisabled(worktreeId)) {
      stop(worktreeId, 'disabled')
      return
    }
    if (!target.gates.some((gate) => gate.required)) {
      return
    }
    const chain: Chain =
      existing?.state === 'awaiting-agent'
        ? existing
        : {
            state: 'checking',
            chainId: deps.newChainId(),
            paneKey: agent.paneKey,
            round: 0,
            failingGateIds: [],
            lastFailure: null,
            lastMarker: null,
            pendingTurn: false,
            outgoing: null,
            resumed: false,
            generation: (existing?.generation ?? 0) + 1
          }
    chains.set(worktreeId, chain)
    settle(worktreeId, chain, 'checking')
    await check(worktreeId, agent, target, chain)
  }

  /** One check per worktree at a time; see `handle` for what happens to a step that ends meanwhile. */
  function startCheck(worktreeId: string, agent: QualityGateLoopAgent): Promise<void> {
    const run = onStepCompleted(worktreeId, agent)
      .catch((error: unknown) => {
        console.error('[quality-gates] feedback loop failed:', errorMessage(error))
      })
      .then(() => {
        inFlight.delete(worktreeId)
        calledOff.delete(worktreeId)
        const next = queued.get(worktreeId)
        queued.delete(worktreeId)
        return next ? startCheck(worktreeId, next) : undefined
      })
    inFlight.set(worktreeId, run)
    return run
  }

  function onTurnStarted(
    event: Extract<QualityGateLoopAgentEvent, { type: 'turn-started' }>
  ): void {
    const chain = chains.get(event.worktreeId)
    if (!chain || chain.paneKey !== event.paneKey) {
      return
    }
    if (chain.state === 'needs-user') {
      chain.resumed = true
    }
    if (!ACTIVE.has(chain.state)) {
      return
    }
    // The agent can report the turn our message opened before the delivery itself returns.
    if (chain.outgoing) {
      chain.outgoing.turnSeen = true
      chain.outgoing.named ||= event.prompt.includes(chain.outgoing.marker)
      return
    }
    // Our own message, named by its marker, however often its turn start is reported.
    if (chain.lastMarker !== null && event.prompt.includes(chain.lastMarker)) {
      chain.pendingTurn = false
      return
    }
    // The first turn after a send is taken as ours even unnamed: hooks of some agents carry no
    // prompt text, and reading it as the user's would restart the round count without end.
    if (chain.state === 'awaiting-agent' && chain.pendingTurn) {
      chain.pendingTurn = false
      return
    }
    stop(event.worktreeId, 'user-message')
  }

  return {
    /** Never rejects: a loop that fails must not disturb the status pipeline that feeds it. */
    handle(event: QualityGateLoopAgentEvent): Promise<void> {
      switch (event.type) {
        case 'step-completed': {
          const running = inFlight.get(event.worktreeId)
          if (!running) {
            return startCheck(event.worktreeId, event.agent)
          }
          // While the gates run for one step, a second agent's step (or a repeat) starts nothing.
          // Only a step that ends after that check was called off is checked once it is over.
          if (calledOff.has(event.worktreeId)) {
            queued.set(event.worktreeId, event.agent)
          }
          return running
        }
        case 'turn-started':
          onTurnStarted(event)
          return Promise.resolve()
        case 'interrupted':
          if (chains.get(event.worktreeId)?.paneKey === event.paneKey) {
            stop(event.worktreeId, 'agent-interrupted')
          }
          return Promise.resolve()
        case 'agent-gone':
          for (const [worktreeId, chain] of chains) {
            if (chain.paneKey === event.paneKey) {
              stop(worktreeId, 'agent-gone')
            }
          }
          return Promise.resolve()
      }
    },

    /** Called after the workspace switch changed; turning it off ends a chain in progress. */
    workspaceSwitchChanged(worktreeId: string): void {
      if (deps.isWorkspaceDisabled(worktreeId)) {
        stop(worktreeId, 'disabled')
      }
      deps.onChanged(worktreeId)
    },

    status(target: QualityGateTarget): QualityGateFeedbackLoopStatus {
      const chain = chains.get(target.worktreeId)
      const workspaceDisabled = deps.isWorkspaceDisabled(target.worktreeId)
      return {
        enabled: target.feedbackLoop.enabled && !workspaceDisabled,
        repoEnabled: target.feedbackLoop.enabled,
        workspaceDisabled,
        maxRounds: target.feedbackLoop.maxRounds,
        state: chain?.state ?? 'idle',
        round: chain?.round ?? 0,
        ...(chain?.stopReason ? { stopReason: chain.stopReason } : {}),
        failingGateIds: chain?.failingGateIds ?? []
      }
    },

    /** Resolves once no check is in flight for the worktree. For tests. */
    async whenSettled(worktreeId: string): Promise<void> {
      await inFlight.get(worktreeId)
    }
  }
}
