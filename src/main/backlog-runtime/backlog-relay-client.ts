import { getActiveMultiplexer } from '../ssh/ssh-target-registry'
import {
  isSshRequestOutcomeUnverifiable,
  type SshChannelMultiplexer
} from '../ssh/ssh-channel-multiplexer'

const capableRelays = new WeakMap<SshChannelMultiplexer, Promise<void>>()

export async function requestRelay<T>(
  connectionId: string,
  method: string,
  params: Record<string, unknown>
): Promise<T> {
  const mux = getActiveMultiplexer(connectionId)
  if (!mux) {
    throw new Error('backlog_ssh_connection_unverifiable')
  }
  let check = capableRelays.get(mux)
  if (!check) {
    check = mux.request('backlog.capabilities', {}, { timeoutMs: 10_000 }).then((result) => {
      const capabilities = (result as { capabilities?: unknown } | null)?.capabilities
      if (!Array.isArray(capabilities) || !capabilities.includes('backlog.v1')) {
        throw new Error('backlog_ssh_relay_capability_missing')
      }
    })
    capableRelays.set(mux, check)
  }
  try {
    await check
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: unknown }).code : undefined
    const unsupported =
      code === -32601 ||
      (error instanceof Error && error.message === 'backlog_ssh_relay_capability_missing')
    if (!unsupported) {
      capableRelays.delete(mux)
    }
    if (isSshRequestOutcomeUnverifiable(error)) {
      throw error
    }
    throw new Error('The SSH relay does not support Backlog yet.')
  }
  return (await mux.request(method, params, { timeoutMs: 20_000 })) as T
}
