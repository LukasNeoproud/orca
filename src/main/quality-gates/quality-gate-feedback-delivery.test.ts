import { describe, expect, it, vi } from 'vitest'
import type { StructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-host'
import {
  createQualityGateFeedbackDelivery,
  type QualityGateFeedbackDeliveryRuntime
} from './quality-gate-feedback-delivery'
import type { QualityGateLoopAgent } from './quality-gate-feedback-loop'

type PromptOptions = Parameters<QualityGateFeedbackDeliveryRuntime['sendTerminalAgentPrompt']>[2]

const agent: QualityGateLoopAgent = {
  paneKey: 'tab:leaf',
  agentType: 'claude',
  terminalHandle: 'term-1',
  turnStartedAt: 1_000,
  completedAt: 2_000
}

function terminal(
  options: {
    idle?: boolean
    lastInputAt?: number | null
    foreground?: 'agent' | 'shell'
    handleForPane?: string | null
  } = {}
) {
  const written: { handle: string; prompt: string; options: PromptOptions }[] = []
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the delivery reads only the members given here.
  const runtime = {
    getTerminalHandleForPaneKey: vi.fn(() => options.handleForPane ?? null),
    waitForTerminal: vi.fn(async (handle: string) => ({
      handle,
      condition: 'tui-idle',
      satisfied: options.idle !== false,
      status: 'running',
      exitCode: null,
      ...(options.idle === false ? { blockedReason: 'agent-interactive-prompt' } : {})
    })),
    // As the runtime does: the check runs before the paste and again before Enter.
    sendTerminalAgentPrompt: vi.fn(async (handle: string, prompt: string, send: PromptOptions) => {
      await send.beforeWrite?.('pty-1')
      written.push({ handle, prompt, options: send })
      await send.beforeWrite?.('pty-1')
      return { handle, accepted: true, bytesWritten: prompt.length }
    }),
    readLaunchedAgentForeground: vi.fn(async () => options.foreground ?? 'agent'),
    subscribeToTerminalData: vi.fn(() => () => {}),
    launchedAgentHostProvesAgent: vi.fn(() => true),
    terminalRunFacts: {
      // The paste itself counts as input by the time Enter is checked.
      readLastInputAt: vi.fn(() => (written.length > 0 ? 9_999 : (options.lastInputAt ?? null)))
    }
  } as unknown as QualityGateFeedbackDeliveryRuntime
  const deliver = createQualityGateFeedbackDelivery({
    runtime,
    structuredHost: () => null,
    newOperationId: () => 'op-1'
  })
  return { deliver, runtime, written }
}

describe('delivery of quality gate feedback', () => {
  it('types the message into the idle terminal agent as input that drives the run', async () => {
    const { deliver, runtime, written } = terminal({ lastInputAt: 900 })
    expect(await deliver(agent, 'gates failed')).toEqual({ kind: 'sent' })
    expect(runtime.waitForTerminal).toHaveBeenCalledWith(
      'term-1',
      expect.objectContaining({ condition: 'tui-idle' })
    )
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({ handle: 'term-1', prompt: 'gates failed' })
    expect(written[0].options).toMatchObject({
      inputKind: 'driving',
      acceptQueued: true,
      requestId: 'op-1'
    })
    // A coordinator's lead line is not this message's to borrow.
    expect(written[0].options.leadLine).toBeUndefined()
  })

  it('finds the terminal by the pane when the status row carries no handle', async () => {
    const { deliver, written } = terminal({ handleForPane: 'term-9' })
    await deliver({ ...agent, terminalHandle: undefined }, 'gates failed')
    expect(written[0].handle).toBe('term-9')
  })

  it('writes nothing when somebody typed into the terminal since the turn began', async () => {
    const { deliver, written } = terminal({ lastInputAt: 1_500 })
    expect(await deliver(agent, 'gates failed')).toMatchObject({
      kind: 'not-deliverable',
      reason: 'user-input'
    })
    expect(written).toEqual([])
  })

  it('writes nothing while the terminal is not idle or a prompt is in the way', async () => {
    const { deliver, runtime } = terminal({ idle: false })
    expect(await deliver(agent, 'gates failed')).toMatchObject({
      kind: 'not-deliverable',
      reason: 'not-deliverable'
    })
    expect(runtime.sendTerminalAgentPrompt).not.toHaveBeenCalled()
  })

  it('writes nothing into a shell the agent left behind', async () => {
    const { deliver, written } = terminal({ foreground: 'shell' })
    expect(await deliver(agent, 'gates failed')).toMatchObject({ kind: 'not-deliverable' })
    expect(written).toEqual([])
  })

  it('has no way to reach an agent without a terminal or of an unknown kind', async () => {
    const { deliver, runtime } = terminal()
    expect(await deliver({ ...agent, terminalHandle: undefined }, 'x')).toMatchObject({
      kind: 'not-deliverable'
    })
    expect(await deliver({ ...agent, agentType: 'my-custom-agent' }, 'x')).toMatchObject({
      kind: 'not-deliverable'
    })
    expect(runtime.waitForTerminal).not.toHaveBeenCalled()
  })

  it('counts a turn start that went unseen after the paste as sent', async () => {
    const { deliver, runtime } = terminal()
    vi.mocked(runtime.sendTerminalAgentPrompt).mockRejectedValueOnce(
      new Error('agent_prompt_stalled')
    )
    expect(await deliver(agent, 'gates failed')).toEqual({ kind: 'sent' })
  })

  describe('structured chat', () => {
    const chatAgent: QualityGateLoopAgent = {
      paneKey: 'structured:s-1',
      agentType: 'claude',
      structuredSessionId: 's-1',
      completedAt: 2_000
    }

    function chat(send: StructuredAgentSessionHost['send'], fence: number | null = 7) {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the delivery reads only the store record and the two send members.
      const host = {
        deps: {
          store: {
            getRecord: () => (fence === null ? undefined : { lease: { runtimeFence: fence } })
          }
        },
        send,
        waitForSendSettlement: vi.fn(async () => undefined)
      } as unknown as StructuredAgentSessionHost
      const { runtime } = terminal()
      return createQualityGateFeedbackDelivery({
        runtime,
        structuredHost: () => host,
        newOperationId: () => 'op-1'
      })
    }

    it("sends the message as one that is not the person's, queued behind a running turn", async () => {
      const send = vi.fn(async (_context: unknown, _mutation: unknown) => ({
        ok: true,
        value: { clientMessageId: 'm-1' }
      }))
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fake answers with the accepted arm only.
      const deliver = chat(send as unknown as StructuredAgentSessionHost['send'])
      expect(await deliver(chatAgent, 'gates failed')).toEqual({ kind: 'sent' })
      expect(send).toHaveBeenCalledTimes(1)
      const [context, mutation] = send.mock.calls[0]
      expect(context).toEqual({ callerKey: 'trusted-local:quality-gates' })
      expect(mutation).toMatchObject({
        delivery: 'queue-if-active',
        envelope: { clientOperationId: 'op-1' },
        body: {
          role: 'user',
          blocks: [{ type: 'text', text: 'gates failed' }],
          from: { kind: 'agent', senders: [{ party: { address: 'orca:quality-gates' } }] }
        }
      })
      expect(JSON.stringify(mutation)).toContain('"s-1"')
    })

    it('reports a refusal and a session this host does not hold as not deliverable', async () => {
      const refusing = vi.fn(async () => ({ ok: false, refusal: { code: 'session_not_attached' } }))
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fake answers with the refused arm only.
      const refused = chat(refusing as unknown as StructuredAgentSessionHost['send'])
      expect(await refused(chatAgent, 'x')).toMatchObject({ kind: 'not-deliverable' })

      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: never called; the session has no record.
      const detached = chat(refusing as unknown as StructuredAgentSessionHost['send'], null)
      refusing.mockClear()
      expect(await detached(chatAgent, 'x')).toMatchObject({ kind: 'not-deliverable' })
      expect(refusing).not.toHaveBeenCalled()

      const { deliver } = terminal()
      expect(await deliver(chatAgent, 'x')).toMatchObject({ kind: 'not-deliverable' })
    })
  })
})
