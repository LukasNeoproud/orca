import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import { AGENT_CONTEXT_STRUCTURED_MOBILE_RUNTIME_CAPABILITY } from '../../../src/shared/protocol-version'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState, RpcResponse } from '../transport/types'
import { useMobileStructuredContextTransitions } from './use-mobile-structured-context-transitions'

const session: AiVaultSession = {
  id: 'history-1',
  executionHostId: 'local',
  agent: 'codex',
  sessionId: 'provider-1',
  title: 'Current work',
  cwd: '/workspace',
  branch: 'main',
  model: null,
  filePath: '/transcript.jsonl',
  codexHome: null,
  createdAt: null,
  updatedAt: null,
  modifiedAt: '2026-09-23T10:00:00.000Z',
  messageCount: 2,
  totalTokens: 10,
  previewMessages: [],
  queuedMessageCount: 0,
  subagentTranscriptCount: 0,
  resumeCommand: 'codex resume provider-1',
  subagent: null,
  structuredSession: {
    sessionId: 'native-1',
    workspaceId: 'workspace-1',
    ownerState: 'live'
  }
}
const sessions = [session]

function response(status: 'queued' | 'completed' = 'queued'): RpcResponse {
  return {
    id: 'rpc-1',
    ok: true,
    result: {
      sessionId: 'native-1',
      workspaceId: 'workspace-1',
      providerSessionId: 'provider-1',
      ownerState: status === 'completed' ? 'exited' : 'live',
      requests: [
        {
          requestId: 'request-1',
          status,
          mode: 'compact',
          reason: 'Ready to compact.',
          continuation: 'wait-for-user',
          createdAt: '2026-09-23T10:00:00.000Z',
          updatedAt: '2026-09-23T10:01:00.000Z',
          ...(status === 'completed'
            ? { result: { newProviderSessionId: 'provider-2', newSessionId: 'native-2' } }
            : {})
        }
      ]
    },
    _meta: { runtimeId: 'runtime-1' }
  }
}

type HookState = ReturnType<typeof useMobileStructuredContextTransitions>

describe('useMobileStructuredContextTransitions', () => {
  let renderer: ReactTestRenderer | null = null
  let state: HookState | null = null

  function Probe(props: {
    client: RpcClient
    connectionState: ConnectionState
    capabilities?: string[]
    worktreeId?: string
  }): null {
    state = useMobileStructuredContextTransitions({
      client: props.client,
      connectionState: props.connectionState,
      hostCapabilities: props.capabilities ?? [AGENT_CONTEXT_STRUCTURED_MOBILE_RUNTIME_CAPABILITY],
      sessions,
      worktreeId: props.worktreeId ?? 'workspace-1'
    })
    return null
  }

  function client(sendRequest: RpcClient['sendRequest']): RpcClient {
    return { sendRequest } as RpcClient
  }

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    state = null
  })

  it('preserves the last host state as unverifiable across disconnect and refreshes on reconnect', async () => {
    const sendRequest = vi
      .fn<RpcClient['sendRequest']>()
      .mockResolvedValueOnce(response('queued'))
      .mockResolvedValueOnce(response('completed'))
    const host = client(sendRequest)
    act(() => {
      renderer = create(createElement(Probe, { client: host, connectionState: 'connected' }))
    })
    await vi.waitFor(() => expect(state?.snapshots[0]?.snapshot.requests[0]?.status).toBe('queued'))

    act(() => {
      renderer!.update(createElement(Probe, { client: host, connectionState: 'reconnecting' }))
    })
    expect(state?.connectionState).toBe('reconnecting')
    expect(state?.snapshots[0]?.snapshot.requests[0]?.status).toBe('queued')
    expect(sendRequest).toHaveBeenCalledTimes(1)

    act(() => {
      renderer!.update(createElement(Probe, { client: host, connectionState: 'connected' }))
    })
    await vi.waitFor(() =>
      expect(state?.snapshots[0]?.snapshot.requests[0]?.status).toBe('completed')
    )
    expect(sendRequest).toHaveBeenCalledTimes(2)
  })

  it('does not call an older host without the dedicated capability', async () => {
    const sendRequest = vi.fn<RpcClient['sendRequest']>()
    act(() => {
      renderer = create(
        createElement(Probe, {
          client: client(sendRequest),
          connectionState: 'connected',
          capabilities: []
        })
      )
    })
    await Promise.resolve()

    expect(state?.supported).toBe(false)
    expect(state?.sources).toHaveLength(1)
    expect(sendRequest).not.toHaveBeenCalled()
  })

  it('drops cached state when the history panel changes workspace scope', async () => {
    const sendRequest = vi.fn<RpcClient['sendRequest']>().mockResolvedValue(response('queued'))
    const host = client(sendRequest)
    act(() => {
      renderer = create(createElement(Probe, { client: host, connectionState: 'connected' }))
    })
    await vi.waitFor(() => expect(state?.snapshots).toHaveLength(1))

    act(() => {
      renderer!.update(
        createElement(Probe, {
          client: host,
          connectionState: 'connected',
          worktreeId: 'workspace-2'
        })
      )
    })

    expect(state?.sources).toHaveLength(0)
    expect(state?.snapshots).toHaveLength(0)
  })

  it('keeps a pending request when cancellation delivery is unknown', async () => {
    const sendRequest = vi
      .fn<RpcClient['sendRequest']>()
      .mockResolvedValueOnce(response('queued'))
      .mockRejectedValueOnce(new Error('connection lost'))
    act(() => {
      renderer = create(
        createElement(Probe, {
          client: client(sendRequest),
          connectionState: 'connected'
        })
      )
    })
    await vi.waitFor(() => expect(state?.snapshots).toHaveLength(1))
    const entry = state!.snapshots[0]!

    await act(async () => {
      await state!.cancel(entry.source, entry.snapshot.requests[0]!)
    })

    expect(state?.snapshots[0]?.snapshot.requests[0]?.status).toBe('queued')
    expect(state?.error).toBe('connection lost')
  })
})
