import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
import { runStructuredInteractionMcpServer } from './structured-interaction-mcp'
import { encodeOrcaInteractionElicitationResponse } from '../shared/orca-interaction-elicitation'
import type { OrcaInteractionRequest } from '../shared/orca-interaction'
import { ORCA_INTERACTION_SOCKET_MAX_FRAME_BYTES } from '../shared/orca-interaction-socket'
import {
  requestStructuredInteractionSocket,
  structuredInteractionSocketEnvironment
} from './structured-interaction-socket-client'

const cleanups: (() => Promise<void>)[] = []
const request: OrcaInteractionRequest = {
  fields: [{ id: 'name', type: 'text', label: 'Name', required: true }]
}
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup()
  }
})

async function fixture(onRequest: (socket: Socket, frame: unknown) => void) {
  const directory = await mkdtemp(join(tmpdir(), 'orca-input-client-'))
  const path =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\orca-input-test-${randomUUID()}`
      : join(directory, 'input.sock')
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => undefined)
    let input = ''
    socket.on('data', (chunk) => {
      input += chunk.toString()
      if (input.includes('\n')) {
        onRequest(socket, JSON.parse(input.trim()))
      }
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, resolve)
  })
  cleanups.push(async () => {
    for (const socket of sockets) {
      socket.destroy()
    }
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(directory, { recursive: true, force: true })
  })
  return { path, token: 'fixture-token' }
}

it('distinguishes absent environment from broken partial configuration', () => {
  expect(structuredInteractionSocketEnvironment({})).toBeNull()
  expect(() =>
    structuredInteractionSocketEnvironment({ ORCA_INTERACTION_SOCKET: '/test' })
  ).toThrow('Incomplete')
  expect(
    structuredInteractionSocketEnvironment({
      ORCA_INTERACTION_SOCKET: '/test',
      ORCA_INTERACTION_TOKEN: 'token'
    })
  ).toEqual({ path: '/test', token: 'token' })
})

it.each([
  { status: 'submitted' as const, values: { name: 'žluťoučký' } },
  { status: 'cancelled' as const }
])(
  'validates a fragmented $status response and sends no caller-controlled identity',
  async (result) => {
    const environment = await fixture((socket, frame) => {
      expect(frame).toEqual({ version: 1, token: 'fixture-token', request })
      const response = Buffer.from(
        `${JSON.stringify({ result: encodeOrcaInteractionElicitationResponse(result) })}\n`
      )
      for (const byte of response) {
        socket.write(Buffer.from([byte]))
      }
    })
    await expect(requestStructuredInteractionSocket(environment, request)).resolves.toEqual(result)
  }
)

it.each([
  { result: { action: 'accept', content: { answer: 'invalid' } } },
  { error: 'Invalid token' },
  null
])('does not interpret invalid or rejected output as cancellation: %j', async (response) => {
  const environment = await fixture((socket) => socket.end(`${JSON.stringify(response)}\n`))
  await expect(requestStructuredInteractionSocket(environment, request)).rejects.toThrow()
})

it('bounds response frames', async () => {
  const environment = await fixture((socket) =>
    socket.end(Buffer.alloc(ORCA_INTERACTION_SOCKET_MAX_FRAME_BYTES + 1, 120))
  )
  await expect(requestStructuredInteractionSocket(environment, request)).rejects.toThrow(
    'transport limit'
  )
})

it('reports premature connection loss instead of a submitted result', async () => {
  const environment = await fixture((socket) => socket.end())
  await expect(requestStructuredInteractionSocket(environment, request)).rejects.toThrow(
    'closed before'
  )
})

it('closes the pending socket on caller cancellation', async () => {
  const controller = new AbortController()
  let disconnected!: () => void
  const closed = new Promise<void>((resolve) => {
    disconnected = resolve
  })
  const environment = await fixture((socket) => {
    socket.once('close', disconnected)
    controller.abort()
  })
  await expect(
    requestStructuredInteractionSocket(environment, request, controller.signal)
  ).rejects.toThrow('cancelled by the caller')
  await closed
})

it('reports a bounded response timeout', async () => {
  const environment = await fixture(() => undefined)
  await expect(
    requestStructuredInteractionSocket(environment, request, undefined, 20)
  ).rejects.toThrow('timed out')
})

it('round-trips an MCP call through the host socket without provider elicitation', async () => {
  const result = { status: 'submitted' as const, values: { name: 'cache' } }
  const environment = await fixture((socket) => {
    socket.end(`${JSON.stringify({ result: encodeOrcaInteractionElicitationResponse(result) })}\n`)
  })
  const input = new PassThrough()
  const output: Record<string, unknown>[] = []
  const server = runStructuredInteractionMcpServer(input, (value) => output.push(value), {
    ORCA_INTERACTION_SOCKET: environment.path,
    ORCA_INTERACTION_TOKEN: environment.token
  })
  input.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'interact', arguments: request } })}\n`
  )
  await vi.waitFor(() => expect(output).toHaveLength(1))
  input.end()
  await server
  expect(output[0]).toMatchObject({ id: 1, result: { structuredContent: result } })
  expect(output.some((frame) => frame.method === 'elicitation/create')).toBe(false)
})
