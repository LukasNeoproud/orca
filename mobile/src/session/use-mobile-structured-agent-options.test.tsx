import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentSessionOptionResult,
  AgentSessionOptionsResult
} from '../../../src/shared/agent-session-wire'
import type { RpcClient } from '../transport/rpc-client'
import type { StructuredAgentSessionMutate } from './mobile-structured-agent-session-rpc'
import { useMobileStructuredAgentOptions } from './use-mobile-structured-agent-options'

type Options = ReturnType<typeof useMobileStructuredAgentOptions>

function options(
  permission: 'custom' | 'read-only' | 'workspace-write'
): AgentSessionOptionsResult {
  return {
    models: [
      {
        id: 'gpt-5.6-sol',
        label: 'GPT-5.6 Sol',
        efforts: [{ value: 'high', label: 'High' }]
      }
    ],
    current: {
      model: 'gpt-5.6-sol',
      effort: 'high',
      confirmed: ['model', 'effort', 'permissions']
    },
    options: [
      {
        id: 'permissions',
        label: 'Permissions',
        category: 'mode',
        choices: [
          { value: 'read-only', label: 'Read only' },
          { value: 'workspace-write', label: 'Workspace' }
        ],
        ...(permission === 'custom'
          ? {
              currentValueLabel: 'Custom',
              currentValueDescription: 'Workspace sandbox · Auto review'
            }
          : { currentValue: permission })
      }
    ]
  }
}

function client(read: (sessionId: string) => AgentSessionOptionsResult): RpcClient {
  return {
    sendRequest: vi.fn(async (method: string, params: unknown) => {
      if (method === 'status.get') {
        return { ok: true, result: { capabilities: [] }, _meta: { runtimeId: 'r1' } }
      }
      return {
        ok: true,
        result: read((params as { sessionId: string }).sessionId),
        _meta: { runtimeId: 'r1' }
      }
    }),
    onStateChange: vi.fn(() => vi.fn())
  } as unknown as RpcClient
}

describe('useMobileStructuredAgentOptions', () => {
  let renderer: ReactTestRenderer | null = null
  let api: Options | null = null
  type ProbeProps = {
    client: RpcClient
    sessionId: string
    mutate: StructuredAgentSessionMutate
  }

  function Probe(props: ProbeProps): null {
    api = useMobileStructuredAgentOptions({
      agent: 'codex',
      client: props.client,
      sessionId: props.sessionId,
      enabled: true,
      fence: 1,
      mutate: props.mutate
    })
    return null
  }

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    api = null
  })

  function render(args: ProbeProps): void {
    act(() => {
      if (renderer) {
        renderer.update(createElement(Probe, args))
      } else {
        renderer = create(createElement(Probe, args))
      }
    })
  }

  it('keeps the provider-reported custom permission state', async () => {
    render({
      client: client(() => options('custom')),
      sessionId: 'session-1',
      mutate: vi.fn(async () => ({ status: 'rejected' }))
    })
    await vi.waitFor(() => expect(api?.optionSnapshot.length).toBeGreaterThan(0))

    expect(api?.optionSnapshot.find((entry) => entry.id === 'permissions')).toMatchObject({
      currentValueLabel: 'Custom',
      currentValueDescription: 'Workspace sandbox · Auto review',
      valueSource: 'reported'
    })
  })

  it('refreshes accepted changes and displays the provider-confirmed value', async () => {
    let reads = 0
    const host = client(() => options(reads++ === 0 ? 'custom' : 'workspace-write'))
    const mutate = vi.fn<StructuredAgentSessionMutate>(async () => ({
      status: 'accepted',
      sameFence: true,
      value: {
        key: 'permissions',
        value: 'workspace-write',
        options: { permissions: 'workspace-write' }
      } as AgentSessionOptionResult
    }))
    render({ client: host, sessionId: 'session-1', mutate })
    await vi.waitFor(() => expect(api?.optionSnapshot.length).toBeGreaterThan(0))

    await act(async () => {
      await api?.setStructuredOption('permissions', 'workspace-write')
    })
    expect(api?.optionSnapshot.find((entry) => entry.id === 'permissions')).toMatchObject({
      kind: { currentValue: 'workspace-write' },
      valueSource: 'reported'
    })
    expect(host.sendRequest).toHaveBeenCalledWith(
      'agentSession.options',
      { sessionId: 'session-1' },
      expect.anything()
    )
  })

  it('keeps the reported value when the provider rejects a change', async () => {
    render({
      client: client(() => options('read-only')),
      sessionId: 'session-1',
      mutate: vi.fn(async () => ({ status: 'rejected' }))
    })
    await vi.waitFor(() => expect(api?.optionSnapshot.length).toBeGreaterThan(0))

    await expect(api!.setStructuredOption('permissions', 'workspace-write')).resolves.toBe(false)
    expect(api?.optionSnapshot.find((entry) => entry.id === 'permissions')).toMatchObject({
      kind: { currentValue: 'read-only' },
      valueSource: 'reported'
    })
  })

  it('does not let a late accepted response overwrite the next active session', async () => {
    let resolveMutation: ((value: unknown) => void) | null = null
    const mutate = vi.fn<StructuredAgentSessionMutate>(
      () =>
        new Promise((resolve) => {
          resolveMutation = resolve
        }) as ReturnType<StructuredAgentSessionMutate>
    )
    const host = client((sessionId) =>
      options(sessionId === 'session-1' ? 'read-only' : 'workspace-write')
    )
    render({ client: host, sessionId: 'session-1', mutate })
    await vi.waitFor(() =>
      expect(api?.optionSnapshot.find((entry) => entry.id === 'permissions')).toMatchObject({
        kind: { currentValue: 'read-only' }
      })
    )
    const pending = api!.setStructuredOption('permissions', 'workspace-write')
    render({ client: host, sessionId: 'session-2', mutate })
    await vi.waitFor(() =>
      expect(api?.optionSnapshot.find((entry) => entry.id === 'permissions')).toMatchObject({
        kind: { currentValue: 'workspace-write' },
        valueSource: 'reported'
      })
    )
    resolveMutation?.({
      status: 'accepted',
      sameFence: true,
      value: {
        key: 'permissions',
        value: 'read-only',
        options: { permissions: 'read-only' }
      }
    })
    await pending

    expect(api?.optionSnapshot.find((entry) => entry.id === 'permissions')).toMatchObject({
      kind: { currentValue: 'workspace-write' },
      valueSource: 'reported'
    })
  })
})
