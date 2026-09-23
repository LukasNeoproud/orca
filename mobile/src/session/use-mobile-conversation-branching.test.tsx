import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AGENT_SESSION_BRANCH_RUNTIME_CAPABILITY } from '../../../src/shared/protocol-version'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import type { AgentSessionBranchRecord } from '../../../src/shared/agent-session-branch'
import type { RpcClient } from '../transport/rpc-client'

const fakes = vi.hoisted(() => ({
  probe: vi.fn(),
  stop: vi.fn(),
  readFamily: vi.fn(),
  push: vi.fn(),
  reveal: vi.fn()
}))

vi.mock('expo-router', () => ({ router: { push: fakes.push } }))
vi.mock('../transport/runtime-capability-probe', () => ({
  startRuntimeCapabilityProbe: (
    client: RpcClient,
    callback: (capabilities: readonly string[]) => void
  ) => {
    fakes.probe(client, callback)
    return fakes.stop
  }
}))
vi.mock('./mobile-conversation-branch-rpc', () => ({
  readMobileConversationFamily: (...args: unknown[]) => fakes.readFamily(...args),
  previewMobileConversationBranch: vi.fn(),
  prepareMobileConversationBranch: vi.fn(),
  startMobileConversationBranch: vi.fn(),
  newMobileConversationBranchOperationId: () => 'operation-1'
}))
vi.mock('./mobile-structured-agent-session-launch', () => ({
  revealMobileStructuredAgentSession: (...args: unknown[]) => fakes.reveal(...args)
}))

import {
  useMobileConversationBranching,
  type MobileConversationBranchController
} from './use-mobile-conversation-branching'

const message: NativeChatMessage = {
  id: 'claude:session:item',
  role: 'assistant',
  source: 'transcript',
  timestamp: 1,
  blocks: [{ type: 'text', text: 'Done' }]
}
const client = { sendRequest: vi.fn() } as unknown as RpcClient
let controller: MobileConversationBranchController

function Harness({ connected = true }: { connected?: boolean }) {
  controller = useMobileConversationBranching({
    client,
    connected,
    enabled: true,
    hostId: 'host-1',
    sourceSessionId: 'claude_source',
    epoch: 'epoch-1',
    branchableMessageIds: new Set([message.id])
  })
  return null
}

describe('useMobileConversationBranching capability gate', () => {
  let renderer: ReactTestRenderer | null = null

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    vi.clearAllMocks()
  })

  it('keeps old-host UI hidden and cancels the probe on disconnect', async () => {
    fakes.readFamily.mockResolvedValue({ branches: [], returns: [] })
    await act(async () => {
      renderer = create(createElement(Harness))
    })
    const callback = fakes.probe.mock.calls[0]![1] as (capabilities: string[]) => void
    act(() => callback([]))
    expect(controller.supported).toBe(false)
    expect(controller.canBranchMessage(message)).toBe(false)
    expect(fakes.readFamily).not.toHaveBeenCalled()

    act(() => callback([AGENT_SESSION_BRANCH_RUNTIME_CAPABILITY]))
    await act(async () => undefined)
    expect(controller.supported).toBe(true)
    expect(controller.canBranchMessage(message)).toBe(true)
    expect(fakes.readFamily).toHaveBeenCalledWith(client, 'claude_source')

    await act(async () => {
      renderer?.update(createElement(Harness, { connected: false }))
    })
    expect(fakes.stop).toHaveBeenCalled()
    expect(controller.supported).toBe(false)
  })

  it('reveals the exact family endpoint and retains the source anchor', async () => {
    fakes.readFamily.mockResolvedValue({ branches: [], returns: [] })
    fakes.reveal.mockResolvedValue(undefined)
    await act(async () => {
      renderer = create(createElement(Harness))
    })
    const branch = {
      source: {
        sessionId: 'claude_source',
        location: { workspaceId: 'source-workspace' },
        anchor: { epoch: 'epoch-1', itemId: message.id }
      },
      target: {
        sessionId: 'claude_target',
        location: { workspaceId: 'target-workspace' }
      }
    } as AgentSessionBranchRecord

    await act(async () => {
      controller.navigate(branch, true)
      await Promise.resolve()
    })
    expect(fakes.reveal).toHaveBeenCalledWith(client, 'claude_source')
    expect(fakes.push).toHaveBeenCalledWith({
      pathname: '/h/[hostId]/session/[worktreeId]',
      params: { hostId: 'host-1', worktreeId: 'source-workspace' }
    })
    expect(controller.anchorRequest).toMatchObject({ epoch: 'epoch-1', itemId: message.id })

    await act(async () => {
      controller.navigate(branch, false)
      await Promise.resolve()
    })
    expect(fakes.reveal).toHaveBeenLastCalledWith(client, 'claude_target')
    expect(fakes.push).toHaveBeenLastCalledWith({
      pathname: '/h/[hostId]/session/[worktreeId]',
      params: { hostId: 'host-1', worktreeId: 'target-workspace' }
    })
  })
})
