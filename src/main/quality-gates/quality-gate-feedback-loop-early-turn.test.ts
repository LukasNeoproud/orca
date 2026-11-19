import { describe, expect, it } from 'vitest'
import type { QualityGateRunOutput, QualityGateRunView } from '../../shared/quality-gate-types'
import {
  createQualityGateFeedbackLoop,
  type QualityGateFeedbackDelivery,
  type QualityGateLoopAgent
} from './quality-gate-feedback-loop'
import type { QualityGateTarget } from './quality-gate-target'

const WORKTREE = 'repo::/work'
const PANE = 'tab:claude'
const agent: QualityGateLoopAgent = { paneKey: PANE, agentType: 'claude', completedAt: 1 }

const target: QualityGateTarget = {
  repoId: 'repo',
  worktreeId: WORKTREE,
  worktreePath: '/work',
  gates: [{ id: 'lint', name: 'Lint', command: 'run-lint', required: true, timeoutSeconds: 60 }],
  feedbackLoop: { enabled: true, maxRounds: 3 },
  launch: { kind: 'native', cwd: '/work' },
  source: { path: '/work', git: true }
}

const failedRun = (id: string): QualityGateRunView => ({
  id,
  gateId: 'lint',
  gate: { name: 'Lint', command: 'run-lint', required: true, timeoutSeconds: 60 },
  repoId: 'repo',
  worktreeId: WORKTREE,
  worktreePath: '/work',
  startedBy: { kind: 'feedback-loop' },
  source: null,
  status: 'failed',
  requestedAt: 1,
  startedAt: 1,
  finishedAt: 2,
  exitCode: 1,
  error: null,
  outputTruncated: false,
  liveness: 'exited',
  freshness: null
})

/** A loop whose gate always fails and whose delivery a test finishes by hand. */
function build() {
  let runs = 0
  const sent: string[] = []
  let finishDelivery: (delivery: QualityGateFeedbackDelivery) => void = () => {}
  const loop = createQualityGateFeedbackLoop({
    resolveTarget: async () => target,
    service: {
      run: () => ({ runs: [{ run: failedRun(`run-${++runs}`), started: true }] }),
      output: async (_target, runId): Promise<QualityGateRunOutput> => ({
        run: failedRun(runId),
        stdout: '',
        stderr: `lint error ${runs}\n`
      }),
      whenIdle: async () => {}
    },
    isWorkspaceDisabled: () => false,
    deliver: (_agent, text) =>
      new Promise((resolve) => {
        sent.push(text)
        finishDelivery = resolve
      }),
    onChanged: () => {},
    newChainId: () => 'qg-1'
  })
  const turn = (prompt: string): Promise<void> =>
    loop.handle({ type: 'turn-started', worktreeId: WORKTREE, paneKey: PANE, prompt })
  /** Starts a step and returns once its message is on the way to the agent. */
  async function stepUntilDelivery(): Promise<{ settled: Promise<void> }> {
    const before = sent.length
    const settled = loop.handle({ type: 'step-completed', worktreeId: WORKTREE, agent })
    await expect.poll(() => sent.length).toBe(before + 1)
    // Wrapped: an async function would wait for a promise it returns bare.
    return { settled }
  }
  return {
    loop,
    sent,
    turn,
    stepUntilDelivery,
    finish: (delivery: QualityGateFeedbackDelivery) => finishDelivery(delivery),
    status: () => loop.status(target)
  }
}

describe('quality gate feedback loop: a turn that starts before the delivery returns', () => {
  it('keeps going when the turn of its own message is reported first', async () => {
    const { sent, turn, stepUntilDelivery, finish, status } = build()
    const { settled } = await stepUntilDelivery()

    await turn(sent[0].split('\n')[0])
    expect(status().state).toBe('checking')
    finish({ kind: 'sent' })
    await settled

    expect(status()).toMatchObject({ state: 'awaiting-agent', round: 1 })
  })

  it('reads the next unnamed turn as the user once its own early turn was seen', async () => {
    const { sent, turn, stepUntilDelivery, finish, status } = build()
    const { settled } = await stepUntilDelivery()
    await turn(sent[0].split('\n')[0])
    finish({ kind: 'sent' })
    await settled

    await turn('')

    expect(status()).toMatchObject({ state: 'stopped', stopReason: 'user-message' })
  })

  it('takes an early turn without prompt text as its own, in the second round as well', async () => {
    const { turn, stepUntilDelivery, finish, status } = build()
    for (const round of [1, 2]) {
      const { settled } = await stepUntilDelivery()
      await turn('')
      finish({ kind: 'sent' })
      await settled
      expect(status()).toMatchObject({ state: 'awaiting-agent', round })
    }
  })

  it('counts the message as sent when its turn began although the delivery reports a failure', async () => {
    const { sent, turn, stepUntilDelivery, finish, status } = build()
    const { settled } = await stepUntilDelivery()
    await turn(sent[0].split('\n')[0])
    finish({ kind: 'not-deliverable', reason: 'not-deliverable', detail: 'stalled' })
    await settled

    expect(status()).toMatchObject({ state: 'awaiting-agent', round: 1 })
  })

  it('stops for the user when a turn began and nothing was delivered', async () => {
    const { turn, stepUntilDelivery, finish, status } = build()
    const { settled } = await stepUntilDelivery()
    await turn('fix the header instead')
    finish({ kind: 'not-deliverable', reason: 'not-deliverable', detail: 'terminal not idle' })
    await settled

    expect(status()).toMatchObject({ state: 'stopped', stopReason: 'user-message', round: 0 })
  })
})
