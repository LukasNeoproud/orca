import { randomBytes, randomUUID } from 'node:crypto'
import type { Socket } from 'node:net'
import { createNdjsonParser } from '../../shared/main-process-ndjson-framer'
import type { OrcaInteractionRequest } from '../../shared/orca-interaction'
import {
  CODEX_MCP_ELICITATION_METHOD,
  decodeOrcaInteractionElicitationResponse,
  encodeOrcaInteractionElicitationMessage,
  encodeOrcaInteractionElicitationResponse,
  ORCA_INTERACTION_ELICITATION_REQUESTED_SCHEMA,
  ORCA_INTERACTION_MCP_SERVER
} from '../../shared/orca-interaction-elicitation'
import {
  ORCA_INTERACTION_SOCKET_ENV,
  ORCA_INTERACTION_SOCKET_MAX_FRAME_BYTES,
  ORCA_INTERACTION_SOCKET_TIMEOUT_MS,
  ORCA_INTERACTION_TOKEN_ENV
} from '../../shared/orca-interaction-socket'
import { readCodexThreadId, readCodexTurnId } from './codex-structured-thread-facts'
import type {
  CodexAppServerConnectionHandlers,
  CodexAppServerServerRequest
} from './codex-app-server-connection-types'
import {
  createCodexInteractionSocketEndpoint,
  type CodexInteractionSocketEndpoint
} from './codex-interaction-socket-bridge-endpoint'
import {
  parseCodexInteractionSocketRequest,
  writeCodexInteractionSocketFrame
} from './codex-interaction-socket-bridge-protocol'

const SYNTHETIC_ID_PREFIX = 'orca-interaction-socket:'
const MAX_CONNECTIONS = 64
const MAX_PENDING_REQUESTS = 32
const AUTH_TIMEOUT_MS = 10_000

export type CodexInteractionBridgeEnvironment = Record<
  typeof ORCA_INTERACTION_SOCKET_ENV | typeof ORCA_INTERACTION_TOKEN_ENV,
  string
>

type PendingInteraction = {
  id: string
  request: OrcaInteractionRequest
  socket: Socket
  threadId: string
  turnId: string
  timer?: ReturnType<typeof setTimeout>
}

export type CodexInteractionSocketBridge = {
  handlers: CodexAppServerConnectionHandlers
  prepare: (threadId: string) => Promise<CodexInteractionBridgeEnvironment>
  observeTurnStartResponse: (params: unknown, response: unknown) => void
  respond: (id: number | string, result: unknown) => boolean
  respondWithError: (id: number | string) => boolean
  close: () => Promise<void>
}

/** Connection-owned input bridge; it never carries approvals or caller-supplied identities. */
export function createCodexInteractionSocketBridge(
  upstream: CodexAppServerConnectionHandlers
): CodexInteractionSocketBridge {
  const token = randomBytes(32)
  const tokenText = token.toString('hex')
  const sockets = new Set<Socket>()
  const pending = new Map<string, PendingInteraction>()
  let endpoint: CodexInteractionSocketEndpoint | null = null
  let rootThreadId: string | null = null
  let activeTurnId: string | null = null
  let closing = false
  let preparePromise: Promise<CodexInteractionBridgeEnvironment> | null = null
  let closePromise: Promise<void> | null = null

  const report = (reason: string): void => {
    try {
      upstream.onUnhandledFrame?.('interaction-socket:rejected', { reason })
    } catch {
      // Diagnostics must not destabilize provider or socket lifecycle.
    }
  }

  const resolveDurablePrompt = (interaction: PendingInteraction): void => {
    try {
      upstream.onNotification?.('serverRequest/resolved', {
        threadId: interaction.threadId,
        requestId: interaction.id
      })
    } catch {
      report('resolution-handler-failed')
    }
  }

  const cancel = (interaction: PendingInteraction, reason: string, reply: boolean): void => {
    if (!pending.delete(interaction.id)) {
      return
    }
    if (interaction.timer) {
      clearTimeout(interaction.timer)
    }
    if (reply) {
      writeCodexInteractionSocketFrame(interaction.socket, { error: 'interaction cancelled' })
    }
    resolveDurablePrompt(interaction)
    report(reason)
  }

  const cancelWhere = (predicate: (interaction: PendingInteraction) => boolean, reason: string) => {
    for (const interaction of pending.values()) {
      if (predicate(interaction)) {
        cancel(interaction, reason, true)
      }
    }
  }

  const rejectSocket = (socket: Socket, reason: string, error: string): void => {
    report(reason)
    if (!writeCodexInteractionSocketFrame(socket, { error })) {
      socket.destroy()
    }
  }

  const acceptRequest = (socket: Socket, value: unknown): void => {
    const request = parseCodexInteractionSocketRequest(value, token)
    if (!request) {
      rejectSocket(socket, 'invalid-request', 'interaction bridge rejected request')
      return
    }
    if (!rootThreadId || !activeTurnId || closing) {
      rejectSocket(socket, 'inactive-turn', 'interaction bridge unavailable')
      return
    }
    if (pending.size >= MAX_PENDING_REQUESTS) {
      rejectSocket(socket, 'capacity', 'interaction bridge unavailable')
      return
    }
    const interaction: PendingInteraction = {
      id: `${SYNTHETIC_ID_PREFIX}${randomUUID()}`,
      request,
      socket,
      threadId: rootThreadId,
      turnId: activeTurnId
    }
    interaction.timer = setTimeout(
      () => cancel(interaction, 'request-timeout', true),
      ORCA_INTERACTION_SOCKET_TIMEOUT_MS
    )
    pending.set(interaction.id, interaction)
    try {
      if (!upstream.onServerRequest) {
        throw new Error('interaction handler unavailable')
      }
      upstream.onServerRequest({
        id: interaction.id,
        method: CODEX_MCP_ELICITATION_METHOD,
        params: {
          threadId: interaction.threadId,
          turnId: interaction.turnId,
          serverName: ORCA_INTERACTION_MCP_SERVER,
          mode: 'form',
          message: encodeOrcaInteractionElicitationMessage(interaction.request),
          requestedSchema: ORCA_INTERACTION_ELICITATION_REQUESTED_SCHEMA
        }
      } satisfies CodexAppServerServerRequest)
    } catch {
      cancel(interaction, 'handler-failed', true)
    }
  }

  const handleSocket = (socket: Socket): void => {
    socket.on('error', () => undefined)
    if (closing || sockets.size >= MAX_CONNECTIONS) {
      rejectSocket(socket, 'connection-capacity', 'interaction bridge unavailable')
      return
    }
    sockets.add(socket)
    socket.setEncoding('utf8')
    const authTimer = setTimeout(() => {
      rejectSocket(socket, 'auth-timeout', 'interaction bridge unavailable')
    }, AUTH_TIMEOUT_MS)
    let received = false
    const parser = createNdjsonParser(
      (value) => {
        if (received) {
          const interaction = [...pending.values()].find((item) => item.socket === socket)
          if (interaction) {
            cancel(interaction, 'multiple-requests', false)
          }
          rejectSocket(socket, 'multiple-requests', 'interaction bridge rejected request')
          return
        }
        received = true
        clearTimeout(authTimer)
        acceptRequest(socket, value)
      },
      () => rejectSocket(socket, 'invalid-frame', 'interaction bridge rejected request'),
      { maxLineBytes: ORCA_INTERACTION_SOCKET_MAX_FRAME_BYTES }
    )
    socket.on('data', parser.feed)
    socket.on('close', () => {
      clearTimeout(authTimer)
      sockets.delete(socket)
      const interaction = [...pending.values()].find((item) => item.socket === socket)
      if (interaction) {
        cancel(interaction, 'client-disconnected', false)
      }
    })
  }

  const observeNotification = (method: string, params: unknown): void => {
    const threadId = readCodexThreadId(params)
    const turnId = readCodexTurnId(params)
    if (threadId === rootThreadId && method === 'turn/started' && turnId) {
      activeTurnId = turnId
    }
    if (threadId === rootThreadId && method === 'turn/completed' && turnId) {
      if (activeTurnId === turnId) {
        activeTurnId = null
      }
      cancelWhere((item) => item.turnId === turnId, 'turn-completed')
    }
    upstream.onNotification?.(method, params)
  }

  const prepare = (threadId: string): Promise<CodexInteractionBridgeEnvironment> => {
    if (closing) {
      return Promise.reject(new Error('interaction bridge is closed'))
    }
    if (rootThreadId && rootThreadId !== threadId) {
      return Promise.reject(new Error('interaction bridge is already bound to another thread'))
    }
    rootThreadId = threadId
    if (preparePromise) {
      return preparePromise
    }
    preparePromise = (async () => {
      endpoint = await createCodexInteractionSocketEndpoint(handleSocket, () =>
        report('server-error')
      )
      return {
        [ORCA_INTERACTION_SOCKET_ENV]: endpoint.path,
        [ORCA_INTERACTION_TOKEN_ENV]: tokenText
      }
    })()
    return preparePromise
  }

  return {
    handlers: { ...upstream, onNotification: observeNotification },
    prepare,
    observeTurnStartResponse: (params, response) => {
      const turnId = readCodexTurnId(response)
      if (readCodexThreadId(params) === rootThreadId && turnId) {
        activeTurnId = turnId
      }
    },
    respond: (id, result) => {
      const interaction = typeof id === 'string' ? pending.get(id) : undefined
      if (!interaction) {
        return typeof id === 'string' && id.startsWith(SYNTHETIC_ID_PREFIX)
      }
      pending.delete(id as string)
      if (interaction.timer) {
        clearTimeout(interaction.timer)
      }
      const decoded = decodeOrcaInteractionElicitationResponse(interaction.request, result)
      if (!decoded) {
        writeCodexInteractionSocketFrame(interaction.socket, {
          error: 'interaction bridge rejected response'
        })
      } else {
        writeCodexInteractionSocketFrame(interaction.socket, {
          result: encodeOrcaInteractionElicitationResponse(decoded)
        })
      }
      return true
    },
    respondWithError: (id) => {
      const interaction = typeof id === 'string' ? pending.get(id) : undefined
      if (!interaction) {
        return typeof id === 'string' && id.startsWith(SYNTHETIC_ID_PREFIX)
      }
      pending.delete(id as string)
      if (interaction.timer) {
        clearTimeout(interaction.timer)
      }
      writeCodexInteractionSocketFrame(interaction.socket, {
        error: 'interaction bridge rejected response'
      })
      return true
    },
    close: () => {
      if (closePromise) {
        return closePromise
      }
      closing = true
      cancelWhere(() => true, 'connection-closed')
      for (const socket of sockets) {
        socket.destroy()
      }
      closePromise = (async () => {
        await preparePromise?.catch(() => undefined)
        await endpoint?.close().catch(() => report('cleanup-failed'))
      })()
      return closePromise
    }
  }
}
