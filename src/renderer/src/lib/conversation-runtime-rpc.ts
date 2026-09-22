import {
  assertRuntimeEnvironmentCapability,
  callRuntimeRpc,
  type RuntimeClientTarget
} from '@/runtime/runtime-rpc-client'
import {
  readLocalRuntimeCapabilitiesOrUnknown,
  refreshLocalRuntimeCapabilities
} from '@/runtime/local-runtime-capabilities'
import type { RuntimeCapability } from '../../../shared/protocol-version'

export async function callConversationRuntimeFeature<T>(
  target: RuntimeClientTarget,
  capability: RuntimeCapability,
  updateMessage: string,
  method: string,
  params: unknown
): Promise<T> {
  if (target.kind === 'environment') {
    await assertRuntimeEnvironmentCapability(
      target.environmentId,
      capability,
      updateMessage,
      15_000
    )
  } else {
    if (readLocalRuntimeCapabilitiesOrUnknown() === null) {
      await refreshLocalRuntimeCapabilities()
    }
    if (!readLocalRuntimeCapabilitiesOrUnknown()?.includes(capability)) {
      throw new Error(updateMessage)
    }
  }
  return callRuntimeRpc<T>(target, method, params, { timeoutMs: 120_000 })
}
