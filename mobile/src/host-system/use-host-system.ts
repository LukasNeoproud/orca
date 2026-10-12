import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { HOST_SYSTEM_RUNTIME_CAPABILITY } from '../../../src/shared/host-feature-runtime-capabilities'
import type {
  HostProcessEntry,
  HostProcessTerminationVerdict,
  HostSwitchablePowerMode,
  HostSystemSnapshot
} from '../../../src/shared/host-system-types'
import type { RpcClient } from '../transport/rpc-client'
import { startRuntimeCapabilityProbe } from '../transport/runtime-capability-probe'
import {
  loadLastHostSystemSnapshot,
  parseHostSystemSnapshot,
  saveLastHostSystemSnapshot
} from './host-system-snapshot'

const POLL_INTERVAL_MS = 5_000
// Process sampling includes a one-second nettop window on macOS.
const SNAPSHOT_TIMEOUT_MS = 10_000
const ACTION_TIMEOUT_MS = 10_000

export function useHostSystem(client: RpcClient | null, hostId: string, connected: boolean) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [snapshot, setSnapshot] = useState<HostSystemSnapshot | null>(null)
  const [live, setLive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)

  useEffect(() => {
    let stale = false
    setSnapshot(null)
    setLive(false)
    void loadLastHostSystemSnapshot(hostId).then((cached) => {
      if (!stale && cached) {
        setSnapshot((current) => current ?? cached)
      }
    })
    return () => {
      stale = true
    }
  }, [hostId])

  useEffect(() => {
    setSupported(null)
    if (!client || !connected) {
      setLive(false)
      return
    }
    return startRuntimeCapabilityProbe(client, (capabilities) =>
      setSupported(capabilities.includes(HOST_SYSTEM_RUNTIME_CAPABILITY))
    )
  }, [client, connected])

  const refresh = useCallback(async () => {
    if (!client || !connected || supported !== true || AppState.currentState !== 'active') {
      return
    }
    const owner = generation.current
    try {
      const response = await client.sendRequest(
        'hostSystem.snapshot',
        { includeProcesses: true },
        { timeoutMs: SNAPSHOT_TIMEOUT_MS, failWhenDisconnected: true }
      )
      if (owner !== generation.current) {
        return
      }
      if (!response.ok) {
        throw new Error(response.error.message)
      }
      const next = parseHostSystemSnapshot(response.result)
      if (!next) {
        throw new Error('The host sent an unreadable system snapshot.')
      }
      setSnapshot(next)
      setLive(true)
      setError(null)
      void saveLastHostSystemSnapshot(hostId, next)
    } catch (err) {
      if (owner === generation.current) {
        setLive(false)
        setError(err instanceof Error ? err.message : String(err))
      }
    }
  }, [client, connected, hostId, supported])

  useFocusEffect(
    useCallback(() => {
      const owner = ++generation.current
      let timer: ReturnType<typeof setTimeout> | null = null
      const loop = async (): Promise<void> => {
        await refresh()
        if (owner === generation.current) {
          timer = setTimeout(() => void loop(), POLL_INTERVAL_MS)
        }
      }
      void loop()
      return () => {
        generation.current += 1
        if (timer) {
          clearTimeout(timer)
        }
      }
    }, [refresh])
  )

  const runAction = useCallback(
    async <T>(method: string, params: unknown): Promise<T | null> => {
      if (!client) {
        return null
      }
      setBusy(true)
      setError(null)
      try {
        const response = await client.sendRequest(method, params, {
          timeoutMs: ACTION_TIMEOUT_MS,
          failWhenDisconnected: true
        })
        if (!response.ok) {
          throw new Error(response.error.message)
        }
        return response.result as T
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return null
      } finally {
        setBusy(false)
        void refresh()
      }
    },
    [client, refresh]
  )

  const setPowerMode = useCallback(
    (mode: HostSwitchablePowerMode) => runAction('hostSystem.setPowerMode', { mode }),
    [runAction]
  )

  const terminateProcess = useCallback(
    async (entry: HostProcessEntry, force: boolean) => {
      const result = await runAction<{ verdict: HostProcessTerminationVerdict }>(
        'hostSystem.terminateProcess',
        { pid: entry.pid, expectedName: entry.name, force }
      )
      return result?.verdict ?? null
    },
    [runAction]
  )

  return { supported, snapshot, live, error, busy, setPowerMode, terminateProcess }
}
