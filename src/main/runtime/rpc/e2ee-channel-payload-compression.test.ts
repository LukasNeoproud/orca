import { describe, expect, it, vi } from 'vitest'
import nacl from 'tweetnacl'
import type { WebSocket } from 'ws'
import { E2EEChannel } from './e2ee-channel'
import type { RpcBinarySender } from './rpc-binary-sender'
import { PairedE2EEV2ClientSession } from '../../../shared/paired-e2ee-v2-client-session'
import { NODE_PAIRED_E2EE_PRIMITIVES } from '../../../shared/paired-e2ee-node-primitives'
import { pairedE2EEV2TokenAuth } from '../../../shared/paired-e2ee-client-handshake'
import { E2EE_GZIP_PAYLOADS_CLIENT_CAPABILITY } from '../../../shared/e2ee-payload-compression'
import {
  TerminalStreamOpcode,
  encodeTerminalStreamFrame
} from '../../../shared/terminal-stream-protocol'

const server = nacl.box.keyPair.fromSecretKey(new Uint8Array(32).fill(1))
const RELAY_HOST_ID = 'AbCdEf0123_-xyZ9'

function connect() {
  const sent: (string | Buffer)[] = []
  const ws = {
    OPEN: 1,
    readyState: 1,
    bufferedAmount: 0,
    send: (data: string | Buffer) => sent.push(data)
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: E2EEChannel only touches OPEN, readyState, bufferedAmount and send.
  const channel = new E2EEChannel(ws as unknown as WebSocket, {
    serverSecretKey: server.secretKey,
    resolveAuthenticatedDevice: (token: string) =>
      token === 'valid-token'
        ? {
            deviceId: 'device-1',
            deviceToken: token,
            scope: 'mobile' as const,
            clientId: token,
            callerFingerprint: 'test-fingerprint',
            credentialRevision: 0
          }
        : null,
    onReady: vi.fn(),
    onError: vi.fn(),
    transportContext: { transport: 'relay', relayHostId: RELAY_HOST_ID },
    requireV2: true
  })
  const client = PairedE2EEV2ClientSession.create({
    primitives: NODE_PAIRED_E2EE_PRIMITIVES,
    desktopPublicKeyB64: Buffer.from(server.publicKey).toString('base64'),
    transport: 'relay',
    relayHostId: RELAY_HOST_ID
  })
  channel.handleRawMessage(JSON.stringify(client.hello))
  expect(client.acceptReady(JSON.parse(String(sent[0])))).toBe(true)
  let reply: ((response: string) => void) | null = null
  let binaryReply: RpcBinarySender | null = null
  channel.onMessage((_plaintext, encryptedReply, encryptedBinaryReply) => {
    reply = encryptedReply
    binaryReply = encryptedBinaryReply
  })
  channel.handleRawMessage(
    client.sealText(JSON.stringify(pairedE2EEV2TokenAuth(client.transcriptHashB64, 'valid-token')))
  )
  expect(client.openText(String(sent[1]))).toContain('e2ee_authenticated')
  channel.handleRawMessage(client.sealText(JSON.stringify({ id: 'r1', method: 'worktree.ps' })))
  return {
    channel,
    client,
    sent,
    reply: (response: string) => reply!(response),
    binaryReply: (bytes: Uint8Array) => binaryReply!(bytes)
  }
}

function lastBinary(sent: (string | Buffer)[]): Buffer {
  const frame = sent.at(-1)
  if (!Buffer.isBuffer(frame)) {
    throw new Error('expected a binary frame')
  }
  return frame
}

const largeReply = JSON.stringify({
  id: 'r1',
  ok: true,
  result: { worktrees: Array.from({ length: 200 }, (_, index) => ({ id: index, path: '/repo' })) }
})

describe('E2EEChannel payload compression', () => {
  it('sends plain payloads until the client advertises gzip support', () => {
    const ctx = connect()
    ctx.reply(largeReply)
    const plaintext = ctx.client.openText(String(ctx.sent.at(-1)))
    expect(plaintext).toBe(largeReply)
    expect(String(ctx.sent.at(-1)).length).toBeGreaterThan(largeReply.length)
  })

  it('gzips large text replies for a client that inflates them', () => {
    const ctx = connect()
    ctx.channel.clientCapabilities = [E2EE_GZIP_PAYLOADS_CLIENT_CAPABILITY]
    ctx.reply(largeReply)
    expect(String(ctx.sent.at(-1)).length).toBeLessThan(largeReply.length / 4)
    expect(ctx.client.openText(String(ctx.sent.at(-1)))).toBe(largeReply)
    // Small replies stay plain: gzip would make them bigger.
    ctx.reply('{"id":"r2","ok":true,"result":{}}')
    expect(ctx.client.openText(String(ctx.sent.at(-1)))).toBe('{"id":"r2","ok":true,"result":{}}')
  })

  it('gzips terminal frames but leaves already-compressed media untouched', () => {
    const ctx = connect()
    ctx.channel.clientCapabilities = [E2EE_GZIP_PAYLOADS_CLIENT_CAPABILITY]
    const terminal = encodeTerminalStreamFrame({
      opcode: TerminalStreamOpcode.SnapshotChunk,
      streamId: 7,
      seq: 1,
      payload: new TextEncoder().encode('\u001b[32m$ ls\u001b[0m\r\n'.repeat(400))
    })
    ctx.binaryReply(terminal)
    const sealedTerminal = lastBinary(ctx.sent)
    expect(sealedTerminal.length).toBeLessThan(terminal.length / 4)
    expect(ctx.client.openBinary(sealedTerminal)).toEqual(terminal)

    const media = new Uint8Array(4096).fill(0x62)
    ctx.binaryReply(media)
    expect(ctx.client.openBinary(lastBinary(ctx.sent))).toEqual(media)
  })
})
