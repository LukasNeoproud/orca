import { randomUUID } from 'node:crypto'
import {
  OrcaInteractionRequestSchema,
  type OrcaInteractionRequest
} from '../shared/orca-interaction'
import {
  TERMINAL_INTERACTION_DEFAULT_TIMEOUT_MS,
  TERMINAL_INTERACTION_WAIT_MAX_MS,
  type TerminalInteractionCaller,
  type TerminalInteractionStatus
} from '../shared/terminal-interaction'
import type { RuntimeClient } from './runtime-client'
import { RuntimeClientError } from './runtime-client'

export const TERMINAL_INTERACTION_WAIT_TRANSPORT_TIMEOUT_MS = 35_000

export function terminalInteractionCallerFromEnvironment(
  env: NodeJS.ProcessEnv = process.env
): TerminalInteractionCaller {
  const terminalHandle = nonEmpty(env.ORCA_TERMINAL_HANDLE)
  const paneKey = nonEmpty(env.ORCA_PANE_KEY)
  if (!terminalHandle || !paneKey) {
    throw new RuntimeClientError(
      'invalid_environment',
      'Orca interaction is available only inside an Orca-owned terminal.'
    )
  }
  return { terminalHandle, paneKey }
}

export function hasTerminalInteractionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(nonEmpty(env.ORCA_TERMINAL_HANDLE) && nonEmpty(env.ORCA_PANE_KEY))
}

export function parseTerminalInteractionRequest(value: unknown): OrcaInteractionRequest {
  const parsed = OrcaInteractionRequestSchema.safeParse(value)
  if (!parsed.success) {
    throw new RuntimeClientError('invalid_argument', 'Invalid Orca interaction request.')
  }
  return parsed.data
}

export async function requestTerminalInteraction(
  client: Pick<RuntimeClient, 'call'>,
  request: OrcaInteractionRequest,
  options: { signal?: AbortSignal; timeoutMs?: number; requestId?: string } = {}
) {
  const caller = terminalInteractionCallerFromEnvironment()
  const requestId = options.requestId ?? randomUUID()
  const timeoutMs = options.timeoutMs ?? TERMINAL_INTERACTION_DEFAULT_TIMEOUT_MS
  const deadline = Date.now() + timeoutMs
  try {
    let status = (
      await awaitWithAbort(
        client.call<TerminalInteractionStatus>('terminalInteraction.request', {
          caller,
          requestId,
          request
        }),
        options.signal
      )
    ).result
    while (status.status === 'pending') {
      throwIfAborted(options.signal)
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        throw new Error('Orca interaction timed out waiting for a response.')
      }
      status = (
        await callWaitWithBusyRetry(
          client,
          { caller, requestId, timeoutMs: Math.min(remaining, TERMINAL_INTERACTION_WAIT_MAX_MS) },
          options.signal,
          deadline
        )
      ).result
    }
    throwIfAborted(options.signal)
    return status.result
  } catch (error) {
    await cancelQuietly(client, caller, requestId)
    if (options.signal?.aborted) {
      throw new Error('Orca interaction was cancelled by the caller.')
    }
    throw error
  }
}

async function cancelQuietly(
  client: Pick<RuntimeClient, 'call'>,
  caller: TerminalInteractionCaller,
  requestId: string
): Promise<void> {
  try {
    await client.call('terminalInteraction.cancel', { caller, requestId }, { timeoutMs: 5_000 })
  } catch {
    // Best effort: the original timeout or cancellation remains the useful error.
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error('Orca interaction was cancelled by the caller.')
  }
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) {
    return promise
  }
  throwIfAborted(signal)
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error('Orca interaction was cancelled by the caller.'))
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

async function callWaitWithBusyRetry(
  client: Pick<RuntimeClient, 'call'>,
  params: { caller: TerminalInteractionCaller; requestId: string; timeoutMs: number },
  signal: AbortSignal | undefined,
  deadline: number
) {
  let delayMs = 50
  for (;;) {
    try {
      return await awaitWithAbort(
        client.call<TerminalInteractionStatus>('terminalInteraction.wait', params, {
          timeoutMs: TERMINAL_INTERACTION_WAIT_TRANSPORT_TIMEOUT_MS
        }),
        signal
      )
    } catch (error) {
      if (!(error instanceof RuntimeClientError) || error.code !== 'runtime_busy') {
        throw error
      }
      if (Date.now() + delayMs >= deadline) {
        throw error
      }
      await abortableDelay(delayMs, signal)
      delayMs = Math.min(delayMs * 2, 1_000)
    }
  }
}

function abortableDelay(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, delayMs)
    const abort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      reject(new Error('Orca interaction was cancelled by the caller.'))
    }
    function done() {
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

function nonEmpty(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
