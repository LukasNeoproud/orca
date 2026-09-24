import type { ScrcpyVideoMeta } from './android/scrcpy-video-frame-parser'
import type { ScrcpyTouchPhase } from './android/scrcpy-touch-frame'

// In-memory pub/sub bridging a live scrcpy session (fed by AndroidEmulatorBackend)
// to renderer subscribers (the video pane, via the emulator-video-stream IPC).
// Caches the codec meta, the config (SPS/PPS) frame, and the current GOP
// (keyframe + following deltas) so a late subscriber can initialize its WebCodecs
// decoder and decode from the keyframe immediately, not after the next GOP.

// scrcpy keyframes ~every 10s; high-motion content can otherwise buffer
// hundreds of deltas. Invalidate an oversized GOP instead of replaying a keyframe
// with missing dependent deltas; late subscribers wait for the next keyframe.
const MAX_GOP_FRAMES = 120
const MAX_GOP_BYTES = 8 * 1024 * 1024

export type ScrcpyVideoFrameMessage = {
  config: boolean
  keyFrame: boolean
  pts: string
  bytes: ArrayBuffer
}

export type ScrcpyVideoEvent =
  | { type: 'meta'; meta: ScrcpyVideoMeta }
  | { type: 'frame'; frame: ScrcpyVideoFrameMessage }

export type ScrcpyVideoSubscriber = (event: ScrcpyVideoEvent) => void

type RegistryEntry = {
  meta?: ScrcpyVideoMeta
  config?: ScrcpyVideoFrameMessage
  gop: ScrcpyVideoFrameMessage[]
  gopBytes: number
  subscribers: Set<ScrcpyVideoSubscriber>
  close: () => void
  sendTouch?: (phase: ScrcpyTouchPhase, x: number, y: number) => boolean
  setVideoSize?: (width: number, height: number) => void
}

class ScrcpyVideoRegistry {
  private readonly entries = new Map<string, RegistryEntry>()

  register(
    deviceId: string,
    close: () => void,
    sendTouch?: (phase: ScrcpyTouchPhase, x: number, y: number) => boolean,
    setVideoSize?: (width: number, height: number) => void
  ): void {
    this.entries.set(deviceId, {
      subscribers: new Set(),
      gop: [],
      gopBytes: 0,
      close,
      sendTouch,
      setVideoSize
    })
  }

  sendTouch(deviceId: string, phase: ScrcpyTouchPhase, x: number, y: number): boolean {
    return this.entries.get(deviceId)?.sendTouch?.(phase, x, y) ?? false
  }

  setVideoSize(deviceId: string, width: number, height: number): void {
    this.entries.get(deviceId)?.setVideoSize?.(width, height)
  }

  pushMeta(deviceId: string, meta: ScrcpyVideoMeta): void {
    const entry = this.entries.get(deviceId)
    if (!entry) {
      return
    }
    entry.meta = meta
    for (const subscriber of entry.subscribers) {
      subscriber({ type: 'meta', meta })
    }
  }

  pushFrame(deviceId: string, frame: ScrcpyVideoFrameMessage): void {
    const entry = this.entries.get(deviceId)
    if (!entry) {
      return
    }
    if (frame.config) {
      entry.config = frame
    } else if (frame.keyFrame) {
      // A keyframe starts a fresh decodeable GOP; buffer it + the following
      // deltas so a late subscriber can decode immediately on replay.
      entry.gop = frame.bytes.byteLength <= MAX_GOP_BYTES ? [frame] : []
      entry.gopBytes = entry.gop.length ? frame.bytes.byteLength : 0
    } else if (entry.gop.length > 0) {
      // Only buffer deltas once a keyframe anchors the GOP (a delta alone is
      // undecodable); deltas before the first keyframe are still sent live below.
      entry.gop.push(frame)
      entry.gopBytes += frame.bytes.byteLength
      if (entry.gop.length > MAX_GOP_FRAMES || entry.gopBytes > MAX_GOP_BYTES) {
        entry.gop = []
        entry.gopBytes = 0
      }
    }
    for (const subscriber of entry.subscribers) {
      subscriber({ type: 'frame', frame })
    }
  }

  // Subscribe a renderer; replays the cached meta + config so the decoder can
  // start without waiting for the next keyframe. Returns an unsubscribe fn.
  subscribe(deviceId: string, subscriber: ScrcpyVideoSubscriber): () => void {
    const entry = this.entries.get(deviceId)
    if (!entry) {
      return () => {}
    }
    if (entry.meta) {
      subscriber({ type: 'meta', meta: entry.meta })
    }
    if (entry.config) {
      subscriber({ type: 'frame', frame: entry.config })
    }
    // Replay the current GOP (keyframe + deltas) so the decoder starts now.
    for (const frame of entry.gop) {
      subscriber({ type: 'frame', frame })
    }
    entry.subscribers.add(subscriber)
    return () => entry.subscribers.delete(subscriber)
  }

  stop(deviceId: string): void {
    const entry = this.entries.get(deviceId)
    if (!entry) {
      return
    }
    entry.close()
    entry.subscribers.clear()
    this.entries.delete(deviceId)
  }

  has(deviceId: string): boolean {
    return this.entries.has(deviceId)
  }
}

export const scrcpyVideoRegistry = new ScrcpyVideoRegistry()
