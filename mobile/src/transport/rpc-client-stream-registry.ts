import type { BrowserScreencastFrame } from './browser-screencast-protocol'
import type {
  EmulatorVideoCodec,
  EmulatorVideoFrame
} from '../../../src/shared/emulator-video-protocol'
import { emulatorStreamVideoCodec, routeMobileImageFrame } from './mobile-image-stream-routing'
import {
  buildRequestStreamUnsubscribe,
  updateTerminalSubscriptionViewport
} from './rpc-client-terminal-subscription'
import {
  buildReadyStreamUnsubscribe,
  isImageStreamMethod,
  isReadyIdStream
} from './rpc-client-server-subscription'
import { isStreamingOpenerReply } from './rpc-acceptance-policies'
import {
  isEmulatorStartingResult,
  isStreamEndResult,
  isStreamingSubscriptionReadyResult,
  isTerminalSubscribedResult
} from './rpc-subscription-result-shapes'
import { RpcClientTerminalStreamRouter } from './rpc-client-terminal-stream-router'
import * as sessionTabsStream from './rpc-client-session-tabs-stream'
import type { RpcEnvelopeFields, RpcRequestFrame } from './rpc-envelope-fields'
import type { ConnectionState, RpcResponse, RpcSuccess } from './types'
import { ImageStreamSlot } from './image-stream-slot'

export type RpcStreamingListener = (result: unknown) => void

export type RpcStreamSubscribeOptions = {
  onBinaryFrame?: (frame: BrowserScreencastFrame) => void
  onEmulatorVideoFrame?: (frame: EmulatorVideoFrame) => void
  envelope?: RpcEnvelopeFields
}

type StreamRequest = {
  method: string
  params: unknown
  envelope?: RpcEnvelopeFields
  listener?: RpcStreamingListener
  onBinaryFrame?: (frame: BrowserScreencastFrame) => void
  onEmulatorVideoFrame?: (frame: EmulatorVideoFrame) => void
  subscriptionId?: string
  videoCodec?: EmulatorVideoCodec
  cancelled?: boolean
  sent?: boolean
  receivedSnapshot?: boolean
}

type StreamRegistryOptions = {
  nextId: () => string
  getState: () => ConnectionState
  sendFrame: (frame: RpcRequestFrame) => boolean
}

export class RpcClientStreamRegistry {
  private readonly streams = new Map<string, StreamRequest>()
  private readonly terminalRouter = new RpcClientTerminalStreamRouter()
  private readonly imageSlot = new ImageStreamSlot()

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
      envelope: subscribeOptions?.envelope,
      listener,
      onBinaryFrame: subscribeOptions?.onBinaryFrame,
      onEmulatorVideoFrame: subscribeOptions?.onEmulatorVideoFrame
    }
    this.streams.set(id, stream)
    if (isImageStreamMethod(method)) {
      this.imageSlot.replace(id).forEach((displaced) => this.dispose(displaced))
    }
    if (this.options.getState() === 'connected') {
      if (this.send(id, stream)) {
        stream.sent = true
      } else {
        this.finish(id, stream, { type: 'error', message: 'Connection interrupted' })
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
        this.imageSlot.reset(id)
      }
      this.resetTerminalRouting(id)
      if (this.send(id, stream)) {
        stream.sent = true
      } else {
        this.markForReplay()
        break
      }
    }
  }

  markForReplay(): void {
    this.imageSlot.reset()
    for (const [id, stream] of this.streams) {
      stream.sent = false
      stream.receivedSnapshot = false
      // The id named a registration on the closed socket; the replay's ready brings the new one.
      stream.subscriptionId = undefined
      stream.videoCodec = undefined
      this.resetTerminalRouting(id)
    }
  }

  handleResponse(response: RpcResponse): boolean {
    if (isStreamingOpenerReply(response)) {
      this.handleStreamingResponse(response)
      return true
    }
    const stream = this.streams.get(response.id)
    if (response.ok) {
      const result = (response as RpcSuccess).result as Record<string, unknown> | null
      if (stream && isStreamEndResult(result)) {
        this.finish(response.id, stream, result)
        return true
      }
      if (stream && result?.type === 'scrollback') {
        stream.listener?.(result)
        return true
      }
    }
    if (!stream) {
      return false
    }
    this.finish(response.id, stream, {
      type: 'error',
      message: response.ok
        ? 'Streaming request ended before it was ready.'
        : response.error.message,
      error: response.ok ? undefined : response.error
    })
    return true
  }

  handleBinary(bytes: Uint8Array): void {
    const imageStream = this.streams.get(this.imageSlot.active ?? '')
    if (routeMobileImageFrame(bytes, imageStream?.cancelled ? undefined : imageStream)) {
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
    if (isStreamEndResult(result)) {
      this.finish(response.id, stream, result)
      return
    }
    if (sessionTabsStream.recordSnapshot(stream, result) && stream.cancelled) {
      this.dispose(response.id)
      return
    }
    // A starting emulator already owns a host subscription that a cancel must release.
    const starting = stream.method === 'emulator.mobile.stream' && isEmulatorStartingResult(result)
    if (starting || isStreamingSubscriptionReadyResult(result)) {
      stream.subscriptionId = result.subscriptionId
      stream.videoCodec = emulatorStreamVideoCodec(stream.method, starting ? null : result)
      if (stream.cancelled) {
        this.sendServerSubscriptionUnsubscribe(stream)
        this.remove(response.id)
        return
      }
      if (!starting && isImageStreamMethod(stream.method)) {
        if (!this.imageSlot.claim(response.id)) {
          this.sendServerSubscriptionUnsubscribe(stream)
          this.remove(response.id)
          return
        }
      }
    }
    if (isTerminalSubscribedResult(result) && stream.listener) {
      this.terminalRouter.register(response.id, result.streamId, stream.listener)
    }
    if (!stream.cancelled) {
      stream.listener?.(result)
    }
  }

  private dispose(id: string): void {
    const stream = this.streams.get(id)
    if (stream) {
      // A canceled opener may never reply; only its host cleanup route must survive.
      stream.listener = undefined
      stream.onBinaryFrame = undefined
      stream.onEmulatorVideoFrame = undefined
    }
    if (stream && isReadyIdStream(stream.method)) {
      if (isImageStreamMethod(stream.method)) {
        this.imageSlot.release(id)
      }
      this.disposeServerSubscription(id, stream)
      return
    }
    if (stream && sessionTabsStream.holdUnsubscribe(stream)) {
      return
    }
    const unsubscribe = buildRequestStreamUnsubscribe(stream?.method, stream?.params, id)
    if (unsubscribe) {
      this.sendRpc(unsubscribe.method, unsubscribe.params, stream?.envelope)
    }
    this.remove(id)
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
      this.sendRpc(unsubscribe.method, unsubscribe.params, stream.envelope)
    }
  }

  // The stream's envelope rides its unsubscribes too: a routing field must reach the same host.
  private sendRpc(method: string, params: unknown, envelope?: RpcEnvelopeFields): boolean {
    return this.options.sendFrame({ id: this.options.nextId(), method, params, envelope })
  }

  private send(id: string, stream: StreamRequest): boolean {
    const { method, params, envelope } = stream
    return this.options.sendFrame({ id, method, params, envelope })
  }

  private remove(id: string): void {
    const stream = this.streams.get(id)
    this.streams.delete(id)
    this.imageSlot.release(id)
    this.resetTerminalRouting(id)
    if (stream && isImageStreamMethod(stream.method)) {
      stream.cancelled = true
    }
  }

  private resetTerminalRouting(id: string): void {
    this.terminalRouter.reset(id)
  }

  /** Removed first, so neither the listener's dispose nor a replay can name a host-ended stream. */
  private finish(id: string, stream: StreamRequest, result: unknown): void {
    const listener = stream.cancelled ? undefined : stream.listener
    this.remove(id)
    listener?.(result)
  }
}
