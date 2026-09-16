import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeAgentSessionPayloadFingerprint } from '../../../../shared/agent-session-mutation-envelope'
import {
  call,
  clearStructuredHostStub,
  envelope,
  hostCalls,
  installStructuredHostStub,
  SESSION,
  STRUCTURED_CLIENT
} from './structured-agent-session-rpc.test-fixture'

const fields = {
  worktree: 'id:workspace-1',
  agent: 'codex',
  providerSessionId: 'thread-1',
  terminal: { tabId: 'tab', paneKey: 'tab:pane', ptyId: 'pty' }
}

function params() {
  return {
    ...fields,
    envelope: envelope({
      expectedRuntimeFence: null,
      payloadFingerprint: computeAgentSessionPayloadFingerprint({
        method: 'agentSession.adoptTerminal',
        sessionId: SESSION,
        fields
      })
    })
  }
}

beforeEach(installStructuredHostStub)
afterEach(clearStructuredHostStub)

describe('structured terminal adoption RPC', () => {
  it('routes the desktop request to host proof with Terminal as the default view', async () => {
    const adopt = vi.fn(async () => ({ sessionId: SESSION, fence: 1, agent: 'codex' }))
    const request = params()
    const response = await call(
      'agentSession.adoptTerminal',
      request,
      {
        ...STRUCTURED_CLIENT,
        clientId: 'desktop-renderer'
      },
      {
        getClientSettings: () => ({
          experimentalStructuredNativeChat: true,
          openAgentTabsInChatByDefault: false
        }),
        adoptStructuredAgentSessionTerminal: adopt
      }
    )
    expect(response).toMatchObject({
      ok: true,
      result: { sessionId: SESSION, fence: 1, agent: 'codex' }
    })
    expect(adopt).toHaveBeenCalledWith(request, 'desktop-renderer')
    expect(hostCalls.attach).not.toHaveBeenCalled()
    expect(hostCalls.requestHandoff).not.toHaveBeenCalled()
  })

  it('accepts an omitted provider-session hint while retaining fingerprint validation', async () => {
    const { providerSessionId: _hint, ...withoutHint } = fields
    const request = {
      ...withoutHint,
      envelope: envelope({
        expectedRuntimeFence: null,
        payloadFingerprint: computeAgentSessionPayloadFingerprint({
          method: 'agentSession.adoptTerminal',
          sessionId: SESSION,
          fields: withoutHint
        })
      })
    }
    const adopt = vi.fn(async () => ({ sessionId: SESSION, fence: 1, agent: 'codex' }))
    expect(
      await call('agentSession.adoptTerminal', request, STRUCTURED_CLIENT, {
        adoptStructuredAgentSessionTerminal: adopt
      })
    ).toMatchObject({ ok: true })
    expect(adopt).toHaveBeenCalledWith(request, expect.any(String))
    expect(
      (
        await call(
          'agentSession.adoptTerminal',
          { ...request, providerSessionId: '' },
          STRUCTURED_CLIENT,
          {
            adoptStructuredAgentSessionTerminal: adopt
          }
        )
      ).ok
    ).toBe(false)
    expect(adopt).toHaveBeenCalledOnce()
  })

  it.each([
    { client: STRUCTURED_CLIENT, enabled: false },
    { client: { clientKind: 'runtime' as const, clientCapabilities: [] }, enabled: true }
  ])('refuses without the setting and negotiated capability: %j', async ({ client, enabled }) => {
    const adopt = vi.fn()
    const response = await call('agentSession.adoptTerminal', params(), client, {
      getClientSettings: () => ({ experimentalStructuredNativeChat: enabled }),
      adoptStructuredAgentSessionTerminal: adopt
    })
    expect(response).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('structured_agent_session_unsupported') }
    })
    expect(adopt).not.toHaveBeenCalled()
  })

  it.each([
    (request: ReturnType<typeof params>) => ({ ...request, providerSessionId: 'another-thread' }),
    (request: ReturnType<typeof params>) => ({
      ...request,
      envelope: { ...request.envelope, expectedRuntimeFence: 4 }
    }),
    (request: ReturnType<typeof params>) => ({ ...request, transcriptPath: '/client/chosen/file' }),
    (request: ReturnType<typeof params>) => ({ ...request, accountHome: '/client/chosen/home' })
  ])('rejects a changed intent or client-selected source paths', async (change) => {
    const adopt = vi.fn()
    const response = await call('agentSession.adoptTerminal', change(params()), STRUCTURED_CLIENT, {
      adoptStructuredAgentSessionTerminal: adopt
    })
    expect(response.ok).toBe(false)
    expect(adopt).not.toHaveBeenCalled()
  })

  it('keeps an unconfirmed registration distinct from a success or a fresh create', async () => {
    const adopt = vi.fn(async () => {
      throw new Error('Adoption could not be confirmed; retry this terminal.')
    })
    const response = await call('agentSession.adoptTerminal', params(), STRUCTURED_CLIENT, {
      adoptStructuredAgentSessionTerminal: adopt
    })
    expect(response).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('could not be confirmed') }
    })
    expect(hostCalls.attach).not.toHaveBeenCalled()
  })
})
