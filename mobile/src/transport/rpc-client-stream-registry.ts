import type { BrowserScreencastFrame } from './browser-screencast-protocol'
import type {
  EmulatorVideoCodec,
  EmulatorVideoFrame
} from '../../../src/shared/emulator-video-protocol'
import { emulatorVideoCodec, routeMobileImageFrame } from './mobile-image-stream-routing'
import {
  buildStreamUnsubscribe,
  buildTerminalUnsubscribeParams,
  updateTerminalSubscriptionViewport
} from './rpc-client-terminal-subscription'
import { buildReadyStreamUnsubscribe, isImageStreamMethod } from './rpc-client-server-subscription'
import {
  isEmulatorStartingResult,
  isStreamingSubscriptionReadyResult,
  isTerminalSubscribedResult
} from './rpc-subscription-result-shapes'
import { RpcClientTerminalStreamRouter } from './rpc-client-terminal-stream-router'
import type { ConnectionState, RpcResponse, RpcSuccess } from './types'

export type RpcStreamingListener = (result: unknown) => void

export type RpcStreamSubscribeOptions = {
  onBinaryFrame?: (frame: BrowserScreencastFrame) => void
  onEmulatorVideoFrame?: (frame: EmulatorVideoFrame) => void
}

type StreamRequest = {
  method: string
  params: unknown
  listener: RpcStreamingListener
  onBinaryFrame?: (frame: BrowserScreencastFrame) => void
  onEmulatorVideoFrame?: (frame: EmulatorVideoFrame) => void
  subscriptionId?: string
  videoCodec?: EmulatorVideoCodec
  cancelled?: boolean
  sent?: boolean
}

type StreamRegistryOptions = {
  nextId: () => string
  deviceToken: string
  getState: () => ConnectionState
  sendEncrypted: (request: unknown) => boolean
}

export class RpcClientStreamRegistry {
  private readonly streams = new Map<string, StreamRequest>()
  private readonly terminalRouter = new RpcClientTerminalStreamRouter()
  private activeImageRequestId: string | null = null
  private pendingImageRequestId: string | null = null

  constructor(private readonly options: StreamRegistryOptions) {}

  subscribe(
    method: string,
    params: unknown,
    listener: RpcStreamingListener,
    subscribeOptions?: RpcStreamSubscribeOptions
  ): () => void {
    const id = this.options.nextId()
    const stream: StreamRequest = {
      method,
      params,
      listener,
      onBinaryFrame: subscribeOptions?.onBinaryFrame,
      onEmulatorVideoFrame: subscribeOptions?.onEmulatorVideoFrame
    }
    this.streams.set(id, stream)
    if (isImageStreamMethod(method)) {
      this.replaceImageStream(id)
    }
    if (this.options.getState() === 'connected') {
      if (this.send(id, stream)) {
        stream.sent = true
      } else {
        this.emitError(stream, 'Connection interrupted')
        this.remove(id)
      }
    } else {
      console.log('[net] subscribe queued — waiting for connected', {
        method,
        state: this.options.getState()
      })
    }
    return () => this.dispose(id)
  }

  replayAfterAuthentication(): void {
    for (const [id, stream] of this.streams) {
      if (stream.cancelled) {
        this.remove(id)
        continue
      }
      if (stream.sent) {
        continue
      }
      if (isImageStreamMethod(stream.method)) {
        this.pendingImageRequestId = id
        this.activeImageRequestId = null
      }
      this.terminalRouter.reset(id)
      if (this.send(id, stream)) {
        stream.sent = true
      } else {
        this.markForReplay()
        break
      }
    }
  }

  markForReplay(): void {
    this.activeImageRequestId = null
    this.pendingImageRequestId = null
    for (const [id, stream] of this.streams) {
      stream.sent = false
      if (isImageStreamMethod(stream.method)) {
        stream.subscriptionId = undefined
        stream.videoCodec = undefined
      }
      this.terminalRouter.reset(id)
    }
  }

  handleResponse(response: RpcResponse): boolean {
    if (response.ok && response.streaming === true) {
      this.handleStreamingResponse(response)
      return true
    }
    const stream = this.streams.get(response.id)
    if (response.ok) {
      const result = (response as RpcSuccess).result as Record<string, unknown> | null
      if (stream && result?.type === 'end') {
        if (!stream.cancelled) {
          stream.listener(result)
        }
        this.remove(response.id)
        return true
      }
      if (stream && result?.type === 'scrollback') {
        stream.listener(result)
        return true
      }
    }
    if (!stream) {
      return false
    }
    this.emitError(
      stream,
      response.ok ? 'Streaming request ended before it was ready.' : response.error.message,
      response.ok ? undefined : response.error
    )
    this.remove(response.id)
    return true
  }

  handleBinary(bytes: Uint8Array): void {
    if (
      routeMobileImageFrame(
        bytes,
        this.activeImageRequestId ? this.streams.get(this.activeImageRequestId) : undefined
      )
    ) {
      return
    }
    this.terminalRouter.handle(bytes)
  }

  updateTerminalViewport(terminal: string, viewport: { cols: number; rows: number }): void {
    updateTerminalSubscriptionViewport(this.streams.values(), terminal, viewport)
  }

  size(): number {
    return this.streams.size
  }

  private handleStreamingResponse(response: RpcSuccess): void {
    const stream = this.streams.get(response.id)
    if (!stream) {
      return
    }
    const result = response.result
    if (stream.method === 'emulator.mobile.stream' && isEmulatorStartingResult(result)) {
      stream.subscriptionId = result.subscriptionId
      stream.videoCodec = undefined
      if (stream.cancelled) {
        this.sendServerSubscriptionUnsubscribe(stream)
        this.remove(response.id)
        return
      }
    }
    if (isStreamingSubscriptionReadyResult(result)) {
      stream.subscriptionId = result.subscriptionId
      stream.videoCodec =
        stream.method === 'emulator.mobile.stream' ? emulatorVideoCodec(result) : undefined
      if (stream.cancelled) {
        this.sendServerSubscriptionUnsubscribe(stream)
        this.remove(response.id)
        return
      }
      if (isImageStreamMethod(stream.method)) {
        if (
          this.pendingImageRequestId !== response.id &&
          this.activeImageRequestId !== response.id
        ) {
          this.sendServerSubscriptionUnsubscribe(stream)
          this.remove(response.id)
          return
        }
        this.pendingImageRequestId = null
        this.activeImageRequestId = response.id
      }
    }
    if (isTerminalSubscribedResult(result)) {
      this.terminalRouter.register(response.id, result.streamId, stream.listener)
    }
    if (!stream.cancelled) {
      stream.listener(result)
    }
  }

  private dispose(id: string): void {
    const stream = this.streams.get(id)
    if (stream && isImageStreamMethod(stream.method)) {
      stream.cancelled = true
      this.clearImageRequest(id)
      this.disposeServerSubscription(id, stream)
      return
    }
    if (stream?.method === 'runtime.clientEvents.subscribe') {
      this.disposeServerSubscription(id, stream)
      return
    }
    if (stream?.method === 'terminal.subscribe') {
      const params = buildTerminalUnsubscribeParams(stream.params)
      if (params) {
        this.sendRpc('terminal.unsubscribe', params)
      }
    } else {
      const unsubscribe = buildStreamUnsubscribe(stream?.method, stream?.params)
      if (unsubscribe) {
        this.sendRpc(unsubscribe.method, unsubscribe.params)
      }
    }
    this.remove(id)
  }

  private replaceImageStream(id: string): void {
    if (this.activeImageRequestId && this.activeImageRequestId !== id) {
      this.dispose(this.activeImageRequestId)
    }
    if (this.pendingImageRequestId && this.pendingImageRequestId !== id) {
      this.dispose(this.pendingImageRequestId)
    }
    this.pendingImageRequestId = id
    this.activeImageRequestId = null
  }

  private disposeServerSubscription(id: string, stream: StreamRequest): void {
    stream.cancelled = true
    if (stream.subscriptionId) {
      this.sendServerSubscriptionUnsubscribe(stream)
      this.remove(id)
    } else if (!stream.sent) {
      this.remove(id)
    }
  }

  private sendServerSubscriptionUnsubscribe(stream: StreamRequest): void {
    if (!stream.subscriptionId) {
      return
    }
    const unsubscribe = buildReadyStreamUnsubscribe(stream.method, stream.subscriptionId)
    if (unsubscribe) {
      this.sendRpc(unsubscribe.method, unsubscribe.params)
    }
  }

  private sendRpc(method: string, params: unknown): boolean {
    return this.options.sendEncrypted({
      id: this.options.nextId(),
      deviceToken: this.options.deviceToken,
      method,
      params
    })
  }

  private send(id: string, stream: StreamRequest): boolean {
    return this.options.sendEncrypted({
      id,
      deviceToken: this.options.deviceToken,
      method: stream.method,
      params: stream.params
    })
  }

  private remove(id: string): void {
    const stream = this.streams.get(id)
    this.streams.delete(id)
    this.clearImageRequest(id)
    this.terminalRouter.reset(id)
    if (stream && isImageStreamMethod(stream.method)) {
      stream.cancelled = true
    }
  }

  private clearImageRequest(id: string): void {
    if (this.activeImageRequestId === id) {
      this.activeImageRequestId = null
    }
    if (this.pendingImageRequestId === id) {
      this.pendingImageRequestId = null
    }
  }

  private emitError(stream: StreamRequest, message: string, error?: unknown): void {
    if (!stream.cancelled) {
      stream.listener({ type: 'error', message, error })
    }
  }
}
