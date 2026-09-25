import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  openHostLogicalClient,
  retainHostLogicalClientDuringBackgroundTransfer
} from './host-logical-client'
import type { HostProfile } from './types'

const state = vi.hoisted(() => ({
  appState: 'active',
  listener: null as ((state: string) => void) | null,
  setForeground: vi.fn(),
  stop: vi.fn(),
  close: vi.fn()
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    get currentState() {
      return state.appState
    },
    addEventListener: (_event: string, listener: (next: string) => void) => {
      state.listener = listener
      return { remove: () => (state.listener = null) }
    }
  }
}))
vi.mock('./rpc-client', () => ({ connect: () => ({}) }))
vi.mock('./stable-logical-rpc-client', () => ({
  createStableLogicalRpcClient: () => ({ close: state.close, notifyForeground: vi.fn() })
}))
vi.mock('./mobile-direct-endpoint-probe', () => ({ directPathForEndpoint: () => 'direct' }))
vi.mock('./mobile-endpoint-lifecycle', () => ({
  startMobileEndpointLifecycle: () => ({
    setForeground: state.setForeground,
    stop: state.stop,
    nudge: vi.fn()
  })
}))

function setAppState(next: string): void {
  state.appState = next
  state.listener?.(next)
}

describe('host connection background transfer retention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.appState = 'active'
    state.listener = null
  })

  it('retains only the selected host while an APK transfer is active', () => {
    const client = openHostLogicalClient({ endpoint: 'ws://test' } as HostProfile, vi.fn())
    setAppState('background')
    expect(state.setForeground).toHaveBeenLastCalledWith(false)

    const release = retainHostLogicalClientDuringBackgroundTransfer(client)
    expect(state.setForeground).toHaveBeenLastCalledWith(true)
    setAppState('background')
    expect(state.setForeground).toHaveBeenLastCalledWith(true)

    release()
    release()
    expect(state.setForeground).toHaveBeenLastCalledWith(false)
    client.close()
    expect(state.stop).toHaveBeenCalledOnce()
  })
})
