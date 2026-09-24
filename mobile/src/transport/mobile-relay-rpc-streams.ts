import type {
  EmulatorVideoCodec,
  EmulatorVideoFrame
} from '../../../src/shared/emulator-video-protocol'
import { emulatorVideoCodec, routeMobileImageFrame } from './mobile-image-stream-routing'
import {
  handleTerminalBinaryFrame,
  type TerminalSnapshotState
} from './rpc-client-terminal-binary-frame'
import {
  buildStreamUnsubscribe,
  buildTerminalUnsubscribeParams,
  updateTerminalSubscriptionViewport
} from './rpc-client-terminal-subscription'
import { buildReadyStreamUnsubscribe, isImageStreamMethod } from './rpc-client-server-subscription'
import type { RpcClient } from './rpc-client'
import type { RpcResponse, RpcSuccess } from './types'

type StreamRecord = {
  method: string
  params: unknown
  listener: (result: unknown) => void
  onBinaryFrame?: Parameters<RpcClient['subscribe']>[3] extends
    | { onBinaryFrame?: infer Listener }
    | undefined
    ? Listener
    : never
  onEmulatorVideoFrame?: (frame: EmulatorVideoFrame) => void
  streamIds: Set<number>
  subscriptionId?: string
  videoCodec?: EmulatorVideoCodec
  cancelled: boolean
  sent: boolean
  receivedSnapshot?: boolean
}

type StreamUnsubscribe = { method: string; params: unknown }

/** Unsubscribe derived from the subscribe params alone (no server-assigned id). */
function buildParamsUnsubscribe(
  method: string,
  params: unknown,
  requestId: string
): StreamUnsubscribe | null {
  if (method === 'terminal.subscribe') {
    const unsubscribeParams = buildTerminalUnsubscribeParams(params)
    return unsubscribeParams ? { method: 'terminal.unsubscribe', params: unsubscribeParams } : null
  }
  return buildStreamUnsubscribe(method, params, requestId)
}

type StreamManagerOptions = {
  nextId: () => string
  sendFrame: (request: { id: string; method: string; params?: unknown }) => boolean
  waitForConnected: () => Promise<void>
}

export class MobileRelayRpcStreams {
  private readonly streams = new Map<string, StreamRecord>()
  private readonly cancelledSubscriptions = new Map<
    string,
    { method: string; unsubscribe?: StreamUnsubscribe }
  >()
  private readonly terminalListeners = new Map<number, (result: unknown) => void>()
  private readonly terminalSnapshots = new Map<number, TerminalSnapshotState>()
  private activeImageStreamId: string | null = null
  private pendingImageStreamId: string | null = null

  constructor(private readonly options: StreamManagerOptions) {}

  subscribe(
    method: string,
    params: unknown,
    listener: (result: unknown) => void,
    subscribeOptions?: Parameters<RpcClient['subscribe']>[3]
  ): () => void {
    const id = this.options.nextId()
    const stream: StreamRecord = {
      method,
      params,
      listener,
      onBinaryFrame: subscribeOptions?.onBinaryFrame,
      onEmulatorVideoFrame: subscribeOptions?.onEmulatorVideoFrame,
      streamIds: new Set(),
      cancelled: false,
      sent: false
    }
    this.streams.set(id, stream)
    if (isImageStreamMethod(method)) {
      this.replaceImageStream(id)
    }
    void this.options
      .waitForConnected()
      .then(() => {
        if (!stream.cancelled) {
          stream.sent = true
          if (!this.options.sendFrame({ id, method, params: stream.params })) {
            this.fail(id, stream, 'Connection interrupted')
          }
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Connection interrupted'
        this.fail(id, stream, message, error)
      })
    return () => this.cancel(id)
  }

  updateTerminalViewport(terminal: string, viewport: { cols: number; rows: number }): void {
    updateTerminalSubscriptionViewport(this.streams.values(), terminal, viewport)
  }

  handleResponse(response: RpcResponse): boolean {
    const cancelled = this.cancelledSubscriptions.get(response.id)
    if (cancelled) {
      if (!response.ok) {
        this.cancelledSubscriptions.delete(response.id)
      } else if (response.result && typeof response.result === 'object') {
        const result = response.result as { subscriptionId?: unknown; type?: unknown }
        if (result.type === 'end') {
          this.cancelledSubscriptions.delete(response.id)
        } else if (result.type === 'snapshot' && cancelled.unsubscribe) {
          this.cancelledSubscriptions.delete(response.id)
          this.options.sendFrame({ id: this.options.nextId(), ...cancelled.unsubscribe })
        } else if (typeof result.subscriptionId === 'string') {
          this.cancelledSubscriptions.delete(response.id)
          const unsubscribe = buildReadyStreamUnsubscribe(cancelled.method, result.subscriptionId)
          if (unsubscribe) {
            this.options.sendFrame({ id: this.options.nextId(), ...unsubscribe })
          }
        }
      }
      if (response.ok && response.streaming !== true) {
        this.cancelledSubscriptions.delete(response.id)
      }
      return true
    }
    const stream = this.streams.get(response.id)
    if (!stream) {
      return false
    }
    if (!response.ok) {
      this.fail(response.id, stream, response.error.message, response.error)
      return true
    }
    const result = (response as RpcSuccess).result
    if (result && typeof result === 'object') {
      const metadata = result as { subscriptionId?: unknown; streamId?: unknown; type?: unknown }
      if (stream.method === 'session.tabs.subscribe' && metadata.type === 'snapshot') {
        stream.receivedSnapshot = true
      }
      if (typeof metadata.subscriptionId === 'string') {
        stream.subscriptionId = metadata.subscriptionId
      }
      if (stream.method === 'emulator.mobile.stream') {
        if (metadata.type === 'ready') {
          stream.videoCodec = emulatorVideoCodec(metadata)
        } else if (metadata.type === 'starting' || metadata.type === 'reconnecting') {
          stream.videoCodec = undefined
        }
      }
      if (typeof metadata.streamId === 'number') {
        stream.streamIds.add(metadata.streamId)
        this.terminalListeners.set(metadata.streamId, stream.listener)
      }
      if (
        isImageStreamMethod(stream.method) &&
        metadata.type === 'ready' &&
        typeof metadata.subscriptionId === 'string'
      ) {
        if (this.pendingImageStreamId !== response.id && this.activeImageStreamId !== response.id) {
          const unsubscribe = buildReadyStreamUnsubscribe(stream.method, metadata.subscriptionId)
          if (unsubscribe) {
            this.sendUnsubscribe(unsubscribe)
          }
          this.remove(response.id)
          return true
        }
        this.pendingImageStreamId = null
        this.activeImageStreamId = response.id
      }
      if (metadata.type === 'end') {
        stream.listener(result)
        this.remove(response.id)
        return true
      }
    }
    if (!stream.cancelled) {
      stream.listener(result)
    }
    return true
  }

  handleBinary(bytes: Uint8Array): void {
    const stream = this.activeImageStreamId ? this.streams.get(this.activeImageStreamId) : undefined
    if (routeMobileImageFrame(bytes, stream)) {
      return
    }
    handleTerminalBinaryFrame(bytes, {
      terminalSnapshots: this.terminalSnapshots,
      getListener: (streamId) => this.terminalListeners.get(streamId)
    })
  }

  clear(): void {
    for (const stream of this.streams.values()) {
      stream.cancelled = true
    }
    this.streams.clear()
    this.cancelledSubscriptions.clear()
    this.terminalListeners.clear()
    this.terminalSnapshots.clear()
    this.activeImageStreamId = null
    this.pendingImageStreamId = null
  }

  private cancel(id: string): void {
    const stream = this.streams.get(id)
    if (!stream || stream.cancelled) {
      return
    }
    stream.cancelled = true
    if (stream.sent) {
      const byParams = buildParamsUnsubscribe(stream.method, stream.params, id)
      if (stream.method === 'terminal.subscribe') {
        if (byParams) {
          this.sendUnsubscribe(byParams)
        }
      } else {
        const unsubscribe = stream.subscriptionId
          ? buildReadyStreamUnsubscribe(stream.method, stream.subscriptionId)
          : null
        if (byParams && stream.method === 'session.tabs.subscribe' && !stream.receivedSnapshot) {
          // The host registers cleanup only after resolving the initial snapshot.
          this.cancelledSubscriptions.set(id, { method: stream.method, unsubscribe: byParams })
        } else if (unsubscribe || byParams) {
          this.sendUnsubscribe((unsubscribe ?? byParams)!)
        } else if (
          isImageStreamMethod(stream.method) ||
          stream.method === 'runtime.clientEvents.subscribe'
        ) {
          // Keep only the cleanup route while the server assigns its subscription ID.
          this.cancelledSubscriptions.set(id, { method: stream.method })
        } else if (stream.subscriptionId) {
          this.sendUnsubscribe({
            method: stream.method.replace(/\.subscribe$/, '.unsubscribe'),
            params: { subscriptionId: stream.subscriptionId }
          })
        }
      }
    }
    this.remove(id)
  }

  /** Skip the unsubscribe when a live sibling shares the host cleanup token (e.g. nativeChat's
   *  deterministic `agent:sessionId`), since the host would evict the sibling's registration. */
  private sendUnsubscribe(unsubscribe: StreamUnsubscribe): void {
    if (this.hasLiveOwner(unsubscribe)) {
      return
    }
    this.options.sendFrame({ id: this.options.nextId(), ...unsubscribe })
  }

  private hasLiveOwner(unsubscribe: StreamUnsubscribe): boolean {
    const token = JSON.stringify(unsubscribe)
    for (const [siblingId, sibling] of this.streams) {
      if (sibling.cancelled || !sibling.sent) {
        continue
      }
      const siblingUnsubscribe = buildParamsUnsubscribe(sibling.method, sibling.params, siblingId)
      if (siblingUnsubscribe && JSON.stringify(siblingUnsubscribe) === token) {
        return true
      }
    }
    return false
  }

  private remove(id: string): void {
    const stream = this.streams.get(id)
    if (!stream) {
      return
    }
    for (const streamId of stream.streamIds) {
      this.terminalListeners.delete(streamId)
      this.terminalSnapshots.delete(streamId)
    }
    if (this.activeImageStreamId === id) {
      this.activeImageStreamId = null
    }
    if (this.pendingImageStreamId === id) {
      this.pendingImageStreamId = null
    }
    this.streams.delete(id)
  }

  private replaceImageStream(id: string): void {
    if (this.activeImageStreamId && this.activeImageStreamId !== id) {
      this.cancel(this.activeImageStreamId)
    }
    if (this.pendingImageStreamId && this.pendingImageStreamId !== id) {
      this.cancel(this.pendingImageStreamId)
    }
    this.activeImageStreamId = null
    this.pendingImageStreamId = id
  }

  private fail(id: string, stream: StreamRecord, message: string, error?: unknown): void {
    if (stream.cancelled || this.streams.get(id) !== stream) {
      return
    }
    try {
      stream.listener({ type: 'error', message, error })
    } finally {
      this.remove(id)
    }
  }
}
