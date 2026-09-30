import { access } from 'node:fs/promises'
import { createConnection, type Socket } from 'node:net'
import { dirname } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  decodeOrcaInteractionElicitationResponse,
  encodeOrcaInteractionElicitationResponse
} from '../../shared/orca-interaction-elicitation'
import {
  ORCA_INTERACTION_SOCKET_ENV,
  ORCA_INTERACTION_SOCKET_MAX_FRAME_BYTES,
  ORCA_INTERACTION_SOCKET_VERSION,
  ORCA_INTERACTION_TOKEN_ENV
} from '../../shared/orca-interaction-socket'
import type { OrcaInteractionRequest } from '../../shared/orca-interaction'
import { createCodexInteractionSocketBridge } from './codex-interaction-socket-bridge'

const request: OrcaInteractionRequest = {
  title: 'Storage',
  fields: [
    {
      id: 'storage',
      type: 'single_choice',
      label: 'Storage',
      required: true,
      options: [{ id: 'room', label: 'Room' }]
    }
  ]
}

async function connect(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path)
    socket.once('connect', () => resolve(socket))
    socket.once('error', reject)
  })
}

async function readFrame(socket: Socket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let input = ''
    const timer = setTimeout(() => reject(new Error('socket response timed out')), 2_000)
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      input += chunk
      const newline = input.indexOf('\n')
      if (newline === -1) {
        return
      }
      clearTimeout(timer)
      resolve(JSON.parse(input.slice(0, newline)) as Record<string, unknown>)
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function sendRequest(socket: Socket, token: string, value = request): void {
  socket.write(
    `${JSON.stringify({
      version: ORCA_INTERACTION_SOCKET_VERSION,
      token,
      request: value
    })}\n`
  )
}

describe('Codex interaction socket bridge', () => {
  it('binds the trusted thread and active turn and returns a canonical form result', async () => {
    let bridge: ReturnType<typeof createCodexInteractionSocketBridge>
    let serverRequest: { id: number | string; params: unknown } | undefined
    bridge = createCodexInteractionSocketBridge({
      onServerRequest: (incoming) => {
        serverRequest = incoming
        bridge.respond(
          incoming.id,
          encodeOrcaInteractionElicitationResponse({
            status: 'submitted',
            values: { storage: 'room' }
          })
        )
      }
    })
    const env = await bridge.prepare('trusted-thread')
    bridge.handlers.onNotification?.('turn/started', {
      threadId: 'trusted-thread',
      turn: { id: 'trusted-turn' }
    })
    bridge.observeTurnStartResponse({ threadId: 'trusted-thread' }, {})
    const socket = await connect(env[ORCA_INTERACTION_SOCKET_ENV])
    sendRequest(socket, env[ORCA_INTERACTION_TOKEN_ENV])

    const frame = await readFrame(socket)
    expect(serverRequest).toMatchObject({
      id: expect.stringMatching(/^orca-interaction-socket:/),
      params: {
        threadId: 'trusted-thread',
        turnId: 'trusted-turn',
        serverName: 'orca_interactive_chat',
        mode: 'form'
      }
    })
    expect(decodeOrcaInteractionElicitationResponse(request, frame.result)).toEqual({
      status: 'submitted',
      values: { storage: 'room' }
    })
    expect(bridge.respond(String(serverRequest?.id), { action: 'cancel' })).toBe(true)
    await bridge.close()
  })

  it('rejects bad authentication and oversized frames without surfacing a prompt', async () => {
    const onServerRequest = vi.fn()
    const rejected: unknown[] = []
    const bridge = createCodexInteractionSocketBridge({
      onServerRequest,
      onUnhandledFrame: (kind, payload) => rejected.push({ kind, payload })
    })
    const env = await bridge.prepare('trusted-thread')
    bridge.handlers.onNotification?.('turn/started', {
      threadId: 'trusted-thread',
      turn: { id: 'trusted-turn' }
    })

    const unauthenticated = await connect(env[ORCA_INTERACTION_SOCKET_ENV])
    sendRequest(unauthenticated, `${env[ORCA_INTERACTION_TOKEN_ENV]}00`)
    await expect(readFrame(unauthenticated)).resolves.toEqual({
      error: 'interaction bridge rejected request'
    })

    const oversized = await connect(env[ORCA_INTERACTION_SOCKET_ENV])
    oversized.write(`${'x'.repeat(ORCA_INTERACTION_SOCKET_MAX_FRAME_BYTES + 1)}\n`)
    await expect(readFrame(oversized)).resolves.toEqual({
      error: 'interaction bridge rejected request'
    })
    expect(onServerRequest).not.toHaveBeenCalled()
    expect(rejected).toEqual(
      expect.arrayContaining([
        { kind: 'interaction-socket:rejected', payload: { reason: 'invalid-request' } },
        { kind: 'interaction-socket:rejected', payload: { reason: 'invalid-frame' } }
      ])
    )
    await bridge.close()
  })

  it('rejects and resolves a request when the durable prompt handler fails', async () => {
    const notifications: { method: string; params: unknown }[] = []
    const bridge = createCodexInteractionSocketBridge({
      onServerRequest: () => {
        throw new Error('sink unavailable')
      },
      onNotification: (method, params) => notifications.push({ method, params })
    })
    const env = await bridge.prepare('trusted-thread')
    bridge.handlers.onNotification?.('turn/started', {
      threadId: 'trusted-thread',
      turn: { id: 'trusted-turn' }
    })
    const socket = await connect(env[ORCA_INTERACTION_SOCKET_ENV])
    sendRequest(socket, env[ORCA_INTERACTION_TOKEN_ENV])

    await expect(readFrame(socket)).resolves.toEqual({ error: 'interaction cancelled' })
    expect(notifications).toContainEqual({
      method: 'serverRequest/resolved',
      params: {
        threadId: 'trusted-thread',
        requestId: expect.stringMatching(/^orca-interaction-socket:/)
      }
    })
    await bridge.close()
  })

  it('resolves the durable prompt when its socket disconnects', async () => {
    let releaseRequest: (id: string) => void = () => undefined
    const received = new Promise<string>((resolve) => (releaseRequest = resolve))
    const notifications: { method: string; params: unknown }[] = []
    const bridge = createCodexInteractionSocketBridge({
      onServerRequest: (incoming) => releaseRequest(String(incoming.id)),
      onNotification: (method, params) => notifications.push({ method, params })
    })
    const env = await bridge.prepare('trusted-thread')
    bridge.handlers.onNotification?.('turn/started', {
      threadId: 'trusted-thread',
      turn: { id: 'trusted-turn' }
    })
    const socket = await connect(env[ORCA_INTERACTION_SOCKET_ENV])
    sendRequest(socket, env[ORCA_INTERACTION_TOKEN_ENV])
    const requestId = await received
    socket.destroy()

    await vi.waitFor(() =>
      expect(notifications).toContainEqual({
        method: 'serverRequest/resolved',
        params: { threadId: 'trusted-thread', requestId }
      })
    )
    await bridge.close()
  })

  it('cancels a pending request at turn completion and removes its private endpoint', async () => {
    let requestSeen: () => void = () => undefined
    const seen = new Promise<void>((resolve) => (requestSeen = resolve))
    const bridge = createCodexInteractionSocketBridge({
      onServerRequest: () => requestSeen()
    })
    const env = await bridge.prepare('trusted-thread')
    const path = env[ORCA_INTERACTION_SOCKET_ENV]
    bridge.handlers.onNotification?.('turn/started', {
      threadId: 'trusted-thread',
      turn: { id: 'trusted-turn' }
    })
    const socket = await connect(path)
    sendRequest(socket, env[ORCA_INTERACTION_TOKEN_ENV])
    await seen
    bridge.handlers.onNotification?.('turn/completed', {
      threadId: 'trusted-thread',
      turn: { id: 'trusted-turn' }
    })

    await expect(readFrame(socket)).resolves.toEqual({ error: 'interaction cancelled' })
    await bridge.close()
    if (process.platform !== 'win32') {
      await expect(access(dirname(path))).rejects.toThrow()
    }
  })
})
