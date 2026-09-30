import { timingSafeEqual } from 'node:crypto'
import type { Socket } from 'node:net'
import { encodeNdjson } from '../../shared/main-process-ndjson-framer'
import {
  OrcaInteractionRequestSchema,
  type OrcaInteractionRequest
} from '../../shared/orca-interaction'
import {
  ORCA_INTERACTION_SOCKET_MAX_FRAME_BYTES,
  ORCA_INTERACTION_SOCKET_VERSION
} from '../../shared/orca-interaction-socket'

function validToken(actual: unknown, expected: Buffer): boolean {
  if (
    typeof actual !== 'string' ||
    actual.length !== expected.length * 2 ||
    !/^[0-9a-f]+$/i.test(actual)
  ) {
    return false
  }
  return timingSafeEqual(Buffer.from(actual, 'hex'), expected)
}

export function parseCodexInteractionSocketRequest(
  value: unknown,
  token: Buffer
): OrcaInteractionRequest | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).some((key) => !['version', 'token', 'request'].includes(key)) ||
    record.version !== ORCA_INTERACTION_SOCKET_VERSION ||
    !validToken(record.token, token)
  ) {
    return null
  }
  const parsed = OrcaInteractionRequestSchema.safeParse(record.request)
  return parsed.success ? parsed.data : null
}

export function writeCodexInteractionSocketFrame(socket: Socket, payload: unknown): boolean {
  try {
    if (!socket.destroyed && socket.writable) {
      socket.end(encodeNdjson(payload, ORCA_INTERACTION_SOCKET_MAX_FRAME_BYTES))
      return true
    }
  } catch {
    socket.destroy()
  }
  return false
}
