import { createConnection } from 'node:net'
import type { OrcaInteractionRequest, OrcaInteractionResult } from '../shared/orca-interaction'
import { decodeOrcaInteractionElicitationResponse } from '../shared/orca-interaction-elicitation'
import {
  ORCA_INTERACTION_SOCKET_ENV,
  ORCA_INTERACTION_TOKEN_ENV,
  ORCA_INTERACTION_SOCKET_VERSION,
  ORCA_INTERACTION_SOCKET_MAX_FRAME_BYTES,
  ORCA_INTERACTION_SOCKET_TIMEOUT_MS
} from '../shared/orca-interaction-socket'

export function structuredInteractionSocketEnvironment(
  env: NodeJS.ProcessEnv
): { path: string; token: string } | null {
  const path = env[ORCA_INTERACTION_SOCKET_ENV]
  const token = env[ORCA_INTERACTION_TOKEN_ENV]
  if (path === undefined && token === undefined) {
    return null
  }
  if (!path || !token) {
    throw new Error('Incomplete Orca interaction bridge environment.')
  }
  return { path, token }
}

export function requestStructuredInteractionSocket(
  environment: { path: string; token: string },
  request: OrcaInteractionRequest,
  signal?: AbortSignal,
  timeoutMs = ORCA_INTERACTION_SOCKET_TIMEOUT_MS
): Promise<OrcaInteractionResult> {
  if (signal?.aborted) {
    return Promise.reject(new Error('Orca interaction was cancelled by the caller.'))
  }
  const frame = `${JSON.stringify({ version: ORCA_INTERACTION_SOCKET_VERSION, token: environment.token, request })}\n`
  if (Buffer.byteLength(frame) > ORCA_INTERACTION_SOCKET_MAX_FRAME_BYTES) {
    return Promise.reject(new Error('Orca interaction request exceeds the transport limit.'))
  }
  return new Promise((resolve, reject) => {
    const socket = createConnection({ path: environment.path })
    let finished = false
    let buffered = Buffer.alloc(0)
    const finish = (error?: Error, result?: OrcaInteractionResult): void => {
      if (finished) {
        return
      }
      finished = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      socket.destroy()
      if (error) {
        reject(error)
      } else {
        resolve(result!)
      }
    }
    const abort = (): void => finish(new Error('Orca interaction was cancelled by the caller.'))
    const timer = setTimeout(
      () => finish(new Error('Orca interaction timed out waiting for a response.')),
      timeoutMs
    )
    signal?.addEventListener('abort', abort, { once: true })
    socket.on('connect', () => socket.write(frame))
    // Endpoint paths and native errors can contain credentials or private workspace names.
    socket.on('error', () => finish(new Error('Orca interaction bridge is unavailable.')))
    socket.on('close', () => finish(new Error('Orca interaction bridge closed before responding.')))
    socket.on('data', (chunk: Buffer) => {
      if (finished) {
        return
      }
      if (buffered.length + chunk.length > ORCA_INTERACTION_SOCKET_MAX_FRAME_BYTES) {
        finish(new Error('Orca interaction response exceeds the transport limit.'))
        return
      }
      buffered = Buffer.concat([buffered, chunk])
      const newline = buffered.indexOf(10)
      if (newline === -1) {
        return
      }
      let response: unknown
      try {
        response = JSON.parse(buffered.subarray(0, newline).toString('utf8'))
      } catch {
        finish(new Error('Invalid Orca interaction bridge response.'))
        return
      }
      try {
        if (!response || typeof response !== 'object' || Array.isArray(response)) {
          throw new Error('Invalid Orca interaction bridge response.')
        }
        if ('error' in response) {
          // The server error is diagnostic only; never interpret it as user cancellation.
          throw new Error('Orca interaction bridge rejected the request.')
        }
        const result = decodeOrcaInteractionElicitationResponse(
          request,
          (response as Record<string, unknown>).result
        )
        if (!result) {
          throw new Error('Invalid Orca interaction bridge response.')
        }
        finish(undefined, result)
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Invalid Orca interaction response.'))
      }
    })
  })
}
