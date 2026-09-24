import { useEffect, useState } from 'react'
import { runtimeEnvironmentSupportsCapability } from '@/runtime/runtime-rpc-client'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { AGENT_CONTEXT_TRANSITIONS_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'

const CAPABILITY_REFRESH_MS = 30_000

export function useAgentContextOwnerAvailable(
  target: RuntimeClientTarget | null,
  localEnabled: boolean
): boolean {
  const environmentId = target?.kind === 'environment' ? target.environmentId : null
  const [owner, setOwner] = useState<{ environmentId: string; available: boolean } | null>(null)

  useEffect(() => {
    if (!environmentId) {
      return
    }
    let disposed = false
    let reading = false
    const refresh = async (): Promise<void> => {
      if (disposed || reading) {
        return
      }
      reading = true
      try {
        const available = await runtimeEnvironmentSupportsCapability(
          environmentId,
          AGENT_CONTEXT_TRANSITIONS_RUNTIME_CAPABILITY,
          15_000
        )
        if (!disposed) {
          setOwner({ environmentId, available })
        }
      } catch {
        // Keep the last known verdict until the owning runtime can answer again.
      } finally {
        reading = false
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), CAPABILITY_REFRESH_MS)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [environmentId])

  return environmentId ? owner?.environmentId === environmentId && owner.available : localEnabled
}
