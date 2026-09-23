import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONVERSATION_CONTINUATION_CAPABILITY } from '../../../src/shared/conversation-continuation-view'
import {
  STRUCTURED_AGENT_SESSION_RESUME_HISTORY_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY
} from '../../../src/shared/protocol-version'
import type { RpcClient } from '../transport/rpc-client'
import {
  clearMobileStructuredLaunchDraft,
  readMobileStructuredLaunchDraft
} from './mobile-structured-launch-drafts'
import { MobileStructuredContinuationPanel } from './MobileStructuredContinuationPanel'

const fakes = vi.hoisted(() => ({ probe: vi.fn(), launch: vi.fn(), inspect: vi.fn() }))
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 }
}))
vi.mock('lucide-react-native', () => ({ ChevronDown: 'ChevronDown' }))
vi.mock('./MobileStructuredContextRequestStatus', () => ({
  MobileStructuredContextRequestStatus: 'ContextStatus'
}))
vi.mock('../transport/runtime-capability-probe', () => ({
  startRuntimeCapabilityProbe: (_client: RpcClient, callback: (capabilities: string[]) => void) => {
    fakes.probe(callback)
    return () => {}
  }
}))
vi.mock('../agent-history/mobile-agent-history-continuation', () => ({
  inspectMobileConversationContinuation: (...args: unknown[]) => fakes.inspect(...args),
  launchMobileConversationContinuation: (...args: unknown[]) => fakes.launch(...args),
  MobileContinuationCancelledError: class extends Error {}
}))

const CAPABILITIES = [
  CONVERSATION_CONTINUATION_CAPABILITY,
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_RESUME_HISTORY_RUNTIME_CAPABILITY
]

describe('live structured continuation', () => {
  let renderer: ReactTestRenderer | null = null
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    fakes.probe.mockReset()
    fakes.launch.mockReset()
    fakes.inspect.mockReset()
    clearMobileStructuredLaunchDraft('host-1', 'copy-1')
  })

  it('gates old and remote hosts before reading or offering continuation', async () => {
    const sendRequest = vi.fn(async (method: string) => {
      if (method === 'agentSession.createSupport') {
        return { ok: true, result: { supported: false, reason: 'remote' } }
      }
      throw new Error(`Unexpected ${method}`)
    })
    await act(async () => {
      renderer = create(
        createElement(MobileStructuredContinuationPanel, {
          client: { sendRequest } as unknown as RpcClient,
          connected: true,
          hostId: 'host-1',
          worktreeId: 'worktree-1',
          sessionId: 'session-1',
          agent: 'codex',
          busy: false,
          draft: '',
          onOpened: vi.fn()
        })
      )
    })
    const probe = fakes.probe.mock.calls[0]![0] as (capabilities: string[]) => void
    act(() => probe([]))
    expect(sendRequest).not.toHaveBeenCalled()
    await act(async () => probe(CAPABILITIES))
    expect(sendRequest.mock.calls.map(([method]) => method)).toEqual(['agentSession.createSupport'])
    expect(renderer!.root.findAllByType('Pressable')).toHaveLength(0)
  })

  it('stages the typed draft and opens the created tab once', async () => {
    const sendRequest = vi.fn(async (method: string) => {
      if (method === 'agentSession.createSupport') {
        return { ok: true, result: { supported: true } }
      }
      if (method === 'agentSession.history') {
        return { ok: true, result: { providerSession: { key: 'session_id', id: 'provider-1' } } }
      }
      throw new Error(`Unexpected ${method}`)
    })
    fakes.inspect.mockResolvedValue({
      source: { providerSessionId: 'provider-1', workspaceId: 'worktree-1' },
      checkpoint: null,
      candidate: null,
      autoCompact: false
    })
    fakes.launch.mockResolvedValue({ kind: 'opened', sessionId: 'copy-1' })
    const onOpened = vi.fn()
    await act(async () => {
      renderer = create(
        createElement(MobileStructuredContinuationPanel, {
          client: { sendRequest } as unknown as RpcClient,
          connected: true,
          hostId: 'host-1',
          worktreeId: 'worktree-1',
          sessionId: 'session-1',
          agent: 'codex',
          busy: false,
          draft: 'Review the fix',
          onOpened
        })
      )
    })
    const probe = fakes.probe.mock.calls[0]![0] as (capabilities: string[]) => void
    await act(async () => probe(CAPABILITIES))
    const header = renderer!.root.findByProps({ accessibilityLabel: 'Conversation continuation' })
    act(() => header.props.onPress())
    const fresh = renderer!.root
      .findAllByType('Pressable')
      .find((item) =>
        item.findAllByType('Text').some((text) => text.props.children === 'New conversation')
      )
    expect(fresh).toBeDefined()
    await act(async () => fresh!.props.onPress())
    expect(fakes.launch).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'fresh', hostId: 'host-1', worktreeId: 'worktree-1' })
    )
    expect(readMobileStructuredLaunchDraft('host-1', 'copy-1')?.text).toBe('Review the fix')
    expect(onOpened).toHaveBeenCalledTimes(1)
    expect(onOpened).toHaveBeenCalledWith('copy-1')
  })
})
