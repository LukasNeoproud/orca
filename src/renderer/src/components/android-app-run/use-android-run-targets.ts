import { useCallback, useEffect, useState } from 'react'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'

export type AndroidRunDevice = {
  id: string
  name: string
  /** `shutdown` is an AVD that Run boots first. */
  state: 'shutdown' | 'booting' | 'booted'
  detail?: string
}

type RawEmulatorDevice = AndroidRunDevice & { backend?: string }

type Loadable<T> = { status: 'loading' | 'ready' | 'error'; value: T; error?: string }

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Devices and build variants for the Run popover, loaded while it is open. */
export function useAndroidRunTargets({
  open,
  worktreePath
}: {
  open: boolean
  worktreePath: string
}): {
  devices: Loadable<AndroidRunDevice[]>
  variants: Loadable<string[]>
  refreshDevices: () => void
  refreshVariants: () => void
} {
  const [devices, setDevices] = useState<Loadable<AndroidRunDevice[]>>({
    status: 'loading',
    value: []
  })
  const [variants, setVariants] = useState<Loadable<string[]>>({ status: 'loading', value: [] })

  const loadDevices = useCallback((isCurrent: () => boolean = () => true): void => {
    setDevices((previous) => ({ ...previous, status: 'loading', error: undefined }))
    // Reuses the emulator pane's inventory, so both always agree on what exists.
    callRuntimeRpc<RawEmulatorDevice[]>({ kind: 'local' }, 'emulator.listDevices', {})
      .then((raw) => {
        if (isCurrent()) {
          const list = raw.filter((device) => device.backend === 'android')
          setDevices({ status: 'ready', value: list })
        }
      })
      .catch((error: unknown) => {
        if (isCurrent()) {
          setDevices({ status: 'error', value: [], error: message(error) })
        }
      })
  }, [])

  const loadVariants = useCallback(
    (refresh: boolean, isCurrent: () => boolean = () => true): void => {
      setVariants((previous) => ({ ...previous, status: 'loading', error: undefined }))
      window.api.androidAppRun
        .listVariants({ worktreePath, refresh })
        .then((result) => {
          if (isCurrent()) {
            setVariants({ status: 'ready', value: result.variants })
          }
        })
        .catch((error: unknown) => {
          if (isCurrent()) {
            setVariants({ status: 'error', value: [], error: message(error) })
          }
        })
    },
    [worktreePath]
  )

  useEffect(() => {
    if (!open) {
      return
    }
    let current = true
    loadDevices(() => current)
    loadVariants(false, () => current)
    return () => {
      current = false
    }
  }, [loadDevices, loadVariants, open])

  return {
    devices,
    variants,
    refreshDevices: useCallback(() => loadDevices(), [loadDevices]),
    refreshVariants: useCallback(() => loadVariants(true), [loadVariants])
  }
}
