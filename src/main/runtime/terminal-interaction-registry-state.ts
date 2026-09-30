import type { OrcaInteractionRequest, OrcaInteractionResult } from '../../shared/orca-interaction'
import type {
  TerminalInteractionCaller,
  TerminalInteractionStatus
} from '../../shared/terminal-interaction'

export const TERMINAL_INTERACTION_REGISTRY_DEFAULTS = {
  callerLeaseMs: 60_000,
  completedRetentionMs: 300_000,
  maxPending: 256,
  maxCompleted: 512
}

export type TerminalInteractionBinding = Readonly<{
  terminalHandle: string
  paneKey: string
  ptyId: string
  incarnationId: string
  terminalTitle?: string
}>

export type TerminalInteractionEntryBase = {
  requestId: string
  caller: TerminalInteractionCaller
  binding: TerminalInteractionBinding
  request: OrcaInteractionRequest
  fingerprint: string
}

export type TerminalInteractionWaiter = (status: TerminalInteractionStatus) => void

export type TerminalInteractionPendingEntry = TerminalInteractionEntryBase & {
  createdAt: number
  leaseExpiresAt: number
  leaseTimer: ReturnType<typeof setTimeout> | null
  waiters: Set<TerminalInteractionWaiter>
}

export type TerminalInteractionCompletedEntry = TerminalInteractionEntryBase & {
  result: OrcaInteractionResult
  completedAt: number
}

export type TerminalInteractionRegistryOptions = Partial<
  typeof TERMINAL_INTERACTION_REGISTRY_DEFAULTS
> & { now?: () => number }

export function sameTerminalInteractionCaller(
  left: TerminalInteractionCaller,
  right: TerminalInteractionCaller
): boolean {
  return left.terminalHandle === right.terminalHandle && left.paneKey === right.paneKey
}

export function sameTerminalInteractionBinding(
  left: TerminalInteractionBinding,
  right: TerminalInteractionBinding
): boolean {
  return (
    sameTerminalInteractionCaller(left, right) &&
    left.ptyId === right.ptyId &&
    left.incarnationId === right.incarnationId
  )
}

export function terminalInteractionCompletedStatus(
  entry: TerminalInteractionCompletedEntry
): TerminalInteractionStatus {
  return {
    requestId: entry.requestId,
    status: 'completed',
    result: structuredClone(entry.result)
  }
}

export function completeTerminalInteractionEntry(
  entry: TerminalInteractionPendingEntry,
  result: OrcaInteractionResult,
  completedAt: number
): TerminalInteractionCompletedEntry {
  return {
    requestId: entry.requestId,
    caller: entry.caller,
    binding: entry.binding,
    request: entry.request,
    fingerprint: entry.fingerprint,
    result: structuredClone(result),
    completedAt
  }
}

export function waitForTerminalInteractionCompletion(
  entry: TerminalInteractionPendingEntry,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<TerminalInteractionStatus> {
  return new Promise((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish: TerminalInteractionWaiter = (status) => {
      if (settled) {
        return
      }
      settled = true
      if (timer) {
        clearTimeout(timer)
      }
      signal?.removeEventListener('abort', onAbort)
      entry.waiters.delete(finish)
      resolve(structuredClone(status))
    }
    const onAbort = (): void => finish({ requestId: entry.requestId, status: 'pending' })
    entry.waiters.add(finish)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) {
      onAbort()
      return
    }
    timer = setTimeout(onAbort, timeoutMs)
    timer.unref?.()
  })
}
