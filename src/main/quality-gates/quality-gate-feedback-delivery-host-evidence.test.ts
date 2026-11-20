import { describe, expect, it, vi } from 'vitest'
import { readRuntimeFixture } from '../runtime/agent-transcript-replay-test-harness'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import {
  COMPOSER_TRANSCRIPT_COLS,
  COMPOSER_TRANSCRIPT_ROWS,
  COMPOSER_TRANSCRIPTS,
  type ComposerTranscriptName
} from './quality-gate-agent-composer-transcripts'
import {
  createQualityGateFeedbackDelivery,
  type QualityGateFeedbackDeliveryRuntime
} from './quality-gate-feedback-delivery'
import type { QualityGateLoopAgent } from './quality-gate-feedback-loop'

type PromptOptions = Parameters<QualityGateFeedbackDeliveryRuntime['sendTerminalAgentPrompt']>[2]

const PTY = 'pty-remote'
const agent: QualityGateLoopAgent = {
  paneKey: 'tab:leaf',
  agentType: 'claude',
  terminalHandle: 'term-1',
  turnStartedAt: 1_000,
  completedAt: 2_000
}

/**
 * The host of the terminal as orcad is on a machine reached over SSH: a runtime with no window, no
 * renderer and no client attached. The input record and the screen are this runtime's own; only the
 * wait and the write are stood in for, because no agent process runs here.
 */
async function hostWithTerminal(transcript: ComposerTranscriptName | null) {
  const host = new OrcaRuntimeService()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the screen read uses only the PTY size.
  host.setPtyController({
    write: () => true,
    kill: () => true,
    getForegroundProcess: async () => null,
    getSize: () => ({ cols: COMPOSER_TRANSCRIPT_COLS, rows: COMPOSER_TRANSCRIPT_ROWS })
  } as unknown as Parameters<OrcaRuntimeService['setPtyController']>[0])
  if (transcript) {
    host.onPtyData(PTY, readRuntimeFixture(transcript), 100)
  }
  const written: string[] = []
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the delivery reads only the members given here.
  const runtime = {
    terminalRunFacts: host.terminalRunFacts,
    serializeAuthoritativeTerminalBuffer: host.serializeAuthoritativeTerminalBuffer.bind(host),
    getTerminalHandleForPaneKey: () => null,
    waitForTerminal: vi.fn(async (handle: string) => ({
      handle,
      condition: 'tui-idle',
      satisfied: true,
      status: 'running',
      exitCode: null
    })),
    sendTerminalAgentPrompt: vi.fn(async (handle: string, prompt: string, send: PromptOptions) => {
      await send.beforeWrite?.(PTY)
      written.push(prompt)
      return { handle, accepted: true, bytesWritten: prompt.length }
    }),
    readLaunchedAgentForeground: async () => 'agent',
    subscribeToTerminalData: () => () => {},
    launchedAgentHostProvesAgent: () => true
  } as unknown as QualityGateFeedbackDeliveryRuntime
  const deliver = createQualityGateFeedbackDelivery({
    runtime,
    structuredHost: () => null,
    newOperationId: () => 'op-1'
  })
  return { host, deliver, written }
}

describe('feedback delivery on the host that runs the terminal', () => {
  it('sends after a key that only confirmed a permission dialog', async () => {
    const { host, deliver, written } = await hostWithTerminal(
      COMPOSER_TRANSCRIPTS.permissionConfirmed
    )
    host.terminalRunFacts.recordInput(PTY, 'driving', '\r', 1_500)
    expect(await deliver(agent, 'gates failed')).toEqual({ kind: 'sent' })
    expect(written).toEqual(['gates failed'])
  })

  it.each([
    ['before', COMPOSER_TRANSCRIPTS.draftBeforePermission, [1_200, 1_600]],
    ['after', COMPOSER_TRANSCRIPTS.draftAfterPermission, [1_600, 1_200]]
  ] as const)(
    'holds the message back for a draft typed %s the confirming key',
    async (_when, transcript, [draftAt, confirmAt]) => {
      const { host, deliver, written } = await hostWithTerminal(transcript)
      host.terminalRunFacts.recordInput(PTY, 'driving', 'my unsent note', draftAt)
      host.terminalRunFacts.recordInput(PTY, 'driving', '\r', confirmAt)
      expect(await deliver(agent, 'gates failed')).toMatchObject({
        kind: 'not-deliverable',
        reason: 'user-input'
      })
      expect(written).toEqual([])
    }
  )

  it('holds the message back when this host recorded input and holds no screen', async () => {
    const { host, deliver, written } = await hostWithTerminal(null)
    host.terminalRunFacts.recordInput(PTY, 'driving', '\r', 1_500)
    expect(await deliver(agent, 'gates failed')).toMatchObject({
      kind: 'not-deliverable',
      reason: 'user-input'
    })
    expect(written).toEqual([])
  })
})
