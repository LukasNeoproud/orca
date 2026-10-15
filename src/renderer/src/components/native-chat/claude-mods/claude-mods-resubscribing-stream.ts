import type { ClaudeModsSurfaceEvent } from '../../../../../shared/claude-mods-surface'
import type { ClaudeModsTransport } from './claude-mods-surface-types'

const RESUBSCRIBE_DELAY_MS = 3_000

/**
 * The host's mods stream, joined again after it breaks (a host restart, lost pairing) rather
 * than left dark. Returns the stop that ends it for good.
 */
export function openClaudeModsResubscribingStream(
  transport: ClaudeModsTransport,
  handlers: { onEvent: (event: ClaudeModsSurfaceEvent) => void; onClose: () => void }
): () => void {
  let stopped = false
  let subscription: { unsubscribe: () => void } | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const retry = (): void => {
    if (!stopped && retryTimer === null) {
      subscription = null
      retryTimer = setTimeout(() => {
        retryTimer = null
        open()
      }, RESUBSCRIBE_DELAY_MS)
    }
  }
  const open = (): void => {
    void transport
      .subscribe({
        onEvent: handlers.onEvent,
        onError: (error) => {
          console.warn('[claude-mods] surface stream failed:', error)
          retry()
        },
        onClose: () => {
          handlers.onClose()
          retry()
        }
      })
      .then((opened) => {
        if (stopped) {
          opened.unsubscribe()
        } else {
          subscription = opened
        }
      })
      .catch((error: unknown) => {
        console.warn('[claude-mods] could not subscribe:', error)
        retry()
      })
  }
  open()
  return () => {
    stopped = true
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
    }
    subscription?.unsubscribe()
  }
}
