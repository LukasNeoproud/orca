import { createHash } from 'node:crypto'
import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { approvalFixture } from '../../../src/shared/device-approval-test-fixture'
import type { RpcClient } from '../transport/rpc-client'
import { useDeviceApprovals } from './use-device-approvals'

const native = vi.hoisted(() => ({
  enroll: vi.fn(),
  getPublicInfo: vi.fn(),
  sign: vi.fn(),
  deleteKey: vi.fn()
}))
const navigation = vi.hoisted(() => ({ focused: true }))

vi.mock('@orca/expo-device-approval', () => ({ deviceApproval: native }))
vi.mock('expo-router', async () => {
  const React = await import('react')
  return {
    useFocusEffect: (callback: () => void | (() => void)) =>
      React.useEffect(
        () => (navigation.focused ? callback() : undefined),
        [callback, navigation.focused]
      )
  }
})
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: vi.fn(() => ({ remove: vi.fn() })) }
}))

const hostId = 'host-1'
const spki = Buffer.from('public-key-spki-fixture').toString('base64')
const keyId = createHash('sha256').update(Buffer.from(spki, 'base64')).digest('hex')
const signatureDerBase64 = Buffer.alloc(70, 1).toString('base64')
let now = 1_000_000
let latest: ReturnType<typeof useDeviceApprovals>
let renderer: ReactTestRenderer | null = null

function approvalPayload() {
  return JSON.stringify({ ...approvalFixture(now), keyId }, null, 2)
}

function host(payload: string) {
  let state = 'connected'
  const sendRequest = vi.fn(async (method: string) => ({
    ok: true,
    result: method === 'deviceApproval.list' ? { supported: true, pending: [{ payload }] } : {}
  }))
  const client = { sendRequest, getState: () => state } as unknown as RpcClient
  return {
    client,
    sendRequest,
    setState: (next: string) => {
      state = next
    }
  }
}

function Probe({ client, connected }: { client: RpcClient; connected: boolean }) {
  latest = useDeviceApprovals(client, hostId, connected)
  return null
}

async function render(client: RpcClient, connected = true) {
  await act(async () => {
    if (renderer) {
      renderer.update(createElement(Probe, { client, connected }))
    } else {
      renderer = create(createElement(Probe, { client, connected }))
    }
  })
}

function respondCalls(sendRequest: ReturnType<typeof vi.fn>) {
  return sendRequest.mock.calls.filter(([method]) => method === 'deviceApproval.respond')
}

beforeEach(() => {
  now = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  navigation.focused = true
  native.enroll.mockReset()
  native.getPublicInfo.mockReset().mockResolvedValue({ publicKeySpkiBase64: spki })
  native.sign.mockReset().mockResolvedValue({ signatureDerBase64 })
  native.deleteKey.mockReset()
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useDeviceApprovals', () => {
  it('keeps an action error across polling and clears it on a successful retry', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    native.sign.mockRejectedValueOnce(
      new Error('Approval key has an invalid authentication policy')
    )
    const rpc = host(approvalPayload())
    await render(rpc.client)
    await act(async () => latest.approve(latest.pending[0]!))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000)
    })

    expect(
      rpc.sendRequest.mock.calls.filter(([method]) => method === 'deviceApproval.list')
    ).toHaveLength(3)
    expect(latest.error).toBe('Approval key has an invalid authentication policy')
    await act(async () => latest.approve(latest.pending[0]!))
    expect(latest.error).toBeNull()
    expect(respondCalls(rpc.sendRequest)).toHaveLength(1)
  })

  it('clears a polling error when loading requests recovers', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const rpc = host(approvalPayload())
    rpc.sendRequest.mockRejectedValueOnce(new Error('Request unavailable'))
    await render(rpc.client)
    expect(latest.error).toBe('Request unavailable')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    expect(latest.error).toBeNull()
    expect(latest.pending).toHaveLength(1)
  })

  it('keeps the screen usable when the native module rejects public-key lookup', async () => {
    native.getPublicInfo.mockRejectedValue(new Error('Native module unavailable'))
    const rpc = host(approvalPayload())

    await render(rpc.client)

    expect(latest.keyId).toBeNull()
    expect(latest.pending).toHaveLength(1)
    expect(latest.supported).toBe(true)
  })

  it('signs the exact raw challenge bytes and sends only the DER signature', async () => {
    const payload = approvalPayload()
    const rpc = host(payload)
    await render(rpc.client)
    expect(latest.pending[0]?.payload).toBe(payload)

    await act(async () => latest.approve(latest.pending[0]!))

    expect(native.sign).toHaveBeenCalledExactlyOnceWith(hostId, payload)
    expect(respondCalls(rpc.sendRequest)).toEqual([
      [
        'deviceApproval.respond',
        { version: 1, requestId: 'a'.repeat(32), signatureDerBase64 },
        { failWhenDisconnected: true, timeoutMs: 10_000 }
      ]
    ])
  })

  it('signs a generic Keychain request without sending secret scopes in the response', async () => {
    const payload = JSON.stringify({
      ...approvalFixture(now),
      keyId,
      operation: { kind: 'keychain-read' },
      requests: [
        { service: 'com.example.credentials', account: 'one' },
        { service: 'com.example.credentials', account: 'two' }
      ]
    })
    const rpc = host(payload)
    await render(rpc.client)
    expect(latest.pending[0]?.payload).toBe(payload)

    await act(async () => latest.approve(latest.pending[0]!))

    expect(native.sign).toHaveBeenCalledExactlyOnceWith(hostId, payload)
    expect(respondCalls(rpc.sendRequest)).toEqual([
      [
        'deviceApproval.respond',
        { version: 1, requestId: 'a'.repeat(32), signatureDerBase64 },
        { failWhenDisconnected: true, timeoutMs: 10_000 }
      ]
    ])
  })

  it('refuses to sign when the local public key does not match the request', async () => {
    native.getPublicInfo.mockResolvedValue({
      publicKeySpkiBase64: Buffer.from('other-key').toString('base64')
    })
    const rpc = host(approvalPayload())
    await render(rpc.client)

    await act(async () => latest.approve(latest.pending[0]!))

    expect(native.sign).not.toHaveBeenCalled()
    expect(respondCalls(rpc.sendRequest)).toEqual([])
    expect(latest.error).toMatch(/not the registered approver/)
  })

  it('drops a signature when the request expires during biometric authentication', async () => {
    let release!: (value: { signatureDerBase64: string }) => void
    native.sign.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    const rpc = host(approvalPayload())
    await render(rpc.client)
    let completion!: Promise<void>
    await act(async () => {
      completion = latest.approve(latest.pending[0]!)
    })

    await act(async () => {
      now += 120_001
      release({ signatureDerBase64 })
      await completion
    })

    expect(respondCalls(rpc.sendRequest)).toEqual([])
    expect(latest.error).toMatch(/expired/)
  })

  it('drops a late signature after the host disconnects', async () => {
    let release!: (value: { signatureDerBase64: string }) => void
    native.sign.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    const rpc = host(approvalPayload())
    await render(rpc.client)
    let completion!: Promise<void>
    await act(async () => {
      completion = latest.approve(latest.pending[0]!)
    })

    rpc.setState('reconnecting')
    await render(rpc.client, false)
    await act(async () => {
      release({ signatureDerBase64 })
      await completion
    })

    expect(respondCalls(rpc.sendRequest)).toEqual([])
  })

  it('drops a late signature after the approval screen loses focus', async () => {
    let release!: (value: { signatureDerBase64: string }) => void
    native.sign.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    const rpc = host(approvalPayload())
    await render(rpc.client)
    let completion!: Promise<void>
    await act(async () => {
      completion = latest.approve(latest.pending[0]!)
    })

    navigation.focused = false
    await render(rpc.client)
    await act(async () => {
      release({ signatureDerBase64 })
      await completion
    })

    expect(respondCalls(rpc.sendRequest)).toEqual([])
  })

  it('sends only the public enrollment fields even if native returns an extra secret', async () => {
    const request = {
      version: 1,
      kind: 'enrollment',
      requestId: 'f'.repeat(32),
      challengeBase64: Buffer.alloc(32, 7).toString('base64'),
      createdAt: now,
      expiresAt: now + 300_000
    }
    const chain = [Buffer.from('leaf').toString('base64'), Buffer.from('root').toString('base64')]
    native.enroll.mockResolvedValue({
      publicKeySpkiBase64: spki,
      attestationCertificateChainBase64: chain,
      privateKey: 'MUST_NOT_SEND'
    })
    const rpc = host(JSON.stringify(request))
    await render(rpc.client)

    await act(async () => latest.approve(latest.pending[0]!))

    expect(native.enroll).toHaveBeenCalledExactlyOnceWith(hostId, request.challengeBase64)
    expect(
      rpc.sendRequest.mock.calls.filter(([method]) => method === 'deviceApproval.enroll')
    ).toEqual([
      [
        'deviceApproval.enroll',
        {
          version: 1,
          requestId: request.requestId,
          publicKeySpkiBase64: spki,
          attestationCertificateChainBase64: chain
        },
        { failWhenDisconnected: true, timeoutMs: 10_000 }
      ]
    ])
    expect(JSON.stringify(rpc.sendRequest.mock.calls)).not.toContain('MUST_NOT_SEND')
  })
})
