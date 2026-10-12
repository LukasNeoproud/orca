import { AppState, Platform } from 'react-native'
import { connect, type RpcClient } from './rpc-client'
import { createStableLogicalRpcClient } from './stable-logical-rpc-client'
import type { ConnectionLogSink, HostProfile } from './types'
import { directPathForEndpoint } from './mobile-direct-endpoint-probe'
import { startMobileEndpointLifecycle } from './mobile-endpoint-lifecycle'

const backgroundTransferRetention = new WeakMap<RpcClient, () => () => void>()

export function retainHostLogicalClientDuringBackgroundTransfer(client: RpcClient): () => void {
  return backgroundTransferRetention.get(client)?.() ?? (() => {})
}

export function openHostLogicalClient(host: HostProfile, onLog: ConnectionLogSink): RpcClient {
  // Why: the stable facade owns app-visible RPC/subscription state while the
  // direct socket remains a replaceable first physical generation.
  const logical = createStableLogicalRpcClient(
    connect(host.endpoint, host.deviceToken, host.publicKeyB64, { onLog }),
    directPathForEndpoint(host.endpoint)
  )
  if (Platform.OS === 'web') {
    return logical
  }

  const endpointLifecycle = startMobileEndpointLifecycle(logical, host, onLog)
  let retainedTransfers = 0
  let closed = false
  const syncForeground = () => {
    if (!closed) {
      endpointLifecycle.setForeground(AppState.currentState === 'active' || retainedTransfers > 0)
    }
  }
  backgroundTransferRetention.set(logical, () => {
    retainedTransfers += 1
    syncForeground()
    let released = false
    return () => {
      if (released) {
        return
      }
      released = true
      retainedTransfers -= 1
      syncForeground()
    }
  })
  syncForeground()
  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (!closed) {
      endpointLifecycle.setForeground(state === 'active' || retainedTransfers > 0)
    }
  })
  const closeLogical = logical.close
  logical.close = () => {
    closed = true
    backgroundTransferRetention.delete(logical)
    appStateSubscription.remove()
    endpointLifecycle.stop()
    closeLogical()
  }
  const notifyLogicalForeground = logical.notifyForeground
  logical.notifyForeground = (reason = 'focus') => {
    // Why: a nudge while already foreground must not re-enter setForeground —
    // that path suspended healthy relays; the supervisor probes or replaces instead.
    endpointLifecycle.nudge(reason)
    notifyLogicalForeground(reason)
  }
  return logical
}
