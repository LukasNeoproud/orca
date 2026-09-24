import { BrowserWindow } from 'electron'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ScrcpyVideoFrameMessage } from './scrcpy-video-registry'

// WebCodecs is available in Electron's renderer, while the scrcpy socket lives in main.
export class MobileEmulatorVideoDecoder {
  private readonly window: BrowserWindow
  private readonly pageDirectory: string
  private pending = Promise.resolve()
  private failure: unknown = null
  private queued = 0
  private awaitingKeyFrame = true
  private deferredConfig: ScrcpyVideoFrameMessage | null = null
  private closed = false

  private constructor(window: BrowserWindow, pageDirectory: string) {
    this.window = window
    this.pageDirectory = pageDirectory
  }

  static async create(
    maxWidth: number,
    quality: number,
    fps: number
  ): Promise<MobileEmulatorVideoDecoder> {
    const pageDirectory = await mkdtemp(join(tmpdir(), 'orca-emulator-decoder-'))
    const pagePath = join(pageDirectory, 'decoder.html')
    let window: BrowserWindow | null = null
    try {
      await writeFile(pagePath, '<!doctype html><meta charset="utf-8">', { mode: 0o600 })
      window = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true,
          nodeIntegration: false,
          contextIsolation: true,
          backgroundThrottling: false,
          offscreen: true
        }
      })
      await window.loadFile(pagePath)
      await window.webContents.executeJavaScript(`
        (() => {
          if (!globalThis.VideoDecoder || !globalThis.EncodedVideoChunk) {
            throw new Error('WebCodecs H.264 decoding is unavailable on this host')
          }
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')
          let config = null
          let timestamp = 0
          let lastImageAt = -Infinity
          let latest = null
          let dropping = false
          const decoder = new VideoDecoder({
            output(frame) {
              try {
                const now = performance.now()
                if (now - lastImageAt >= ${Math.floor(1000 / fps)}) {
                  const scale = Math.min(1, ${maxWidth} / frame.displayWidth)
                  const width = Math.max(1, Math.round(frame.displayWidth * scale))
                  const height = Math.max(1, Math.round(frame.displayHeight * scale))
                  if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = width
                    canvas.height = height
                  }
                  context.drawImage(frame, 0, 0, width, height)
                  latest = {
                    image: canvas.toDataURL('image/jpeg', ${quality / 100}).split(',')[1],
                    width,
                    height,
                    deviceWidth: frame.displayWidth,
                    deviceHeight: frame.displayHeight
                  }
                  lastImageAt = now
                }
              } finally {
                frame.close()
              }
            },
            error(error) { globalThis.__orcaDecoderError = error.message }
          })
          decoder.configure({ codec: 'avc1.640028', optimizeForLatency: true })
          globalThis.__orcaFeedVideo = (base64, isConfig, keyFrame) => {
            let data = Uint8Array.from(atob(base64), character => character.charCodeAt(0))
            if (isConfig) { config = data; return }
            if (decoder.decodeQueueSize > 30) {
              dropping = true
              decoder.reset()
              decoder.configure({ codec: 'avc1.640028', optimizeForLatency: true })
            }
            if (dropping && !keyFrame) return
            if (keyFrame) dropping = false
            if (keyFrame && config) {
              const joined = new Uint8Array(config.length + data.length)
              joined.set(config)
              joined.set(data, config.length)
              data = joined
            }
            decoder.decode(new EncodedVideoChunk({
              type: keyFrame ? 'key' : 'delta', timestamp: ++timestamp, data
            }))
          }
          globalThis.__orcaTakeImage = () => {
            if (globalThis.__orcaDecoderError) throw new Error(globalThis.__orcaDecoderError)
            const value = latest
            latest = null
            return value
          }
          globalThis.__orcaCloseVideo = () => decoder.close()
        })()
      `)
      return new MobileEmulatorVideoDecoder(window, pageDirectory)
    } catch (error) {
      window?.destroy()
      await rm(pageDirectory, { recursive: true, force: true })
      throw error
    }
  }

  feed(frame: ScrcpyVideoFrameMessage): void {
    if (this.closed) {
      return
    }
    if (frame.config && this.queued >= 60) {
      this.deferredConfig = frame
      return
    }
    if (this.queued >= 60) {
      this.awaitingKeyFrame = true
      return
    }
    if (this.awaitingKeyFrame && !frame.config && !frame.keyFrame) {
      return
    }
    if (this.awaitingKeyFrame && frame.keyFrame) {
      if (this.deferredConfig) {
        this.enqueueFrame(this.deferredConfig)
        this.deferredConfig = null
      }
      this.awaitingKeyFrame = false
    }
    this.enqueueFrame(frame)
  }

  private enqueueFrame(frame: ScrcpyVideoFrameMessage): void {
    this.queued += 1
    const encoded = Buffer.from(frame.bytes).toString('base64')
    this.pending = this.pending
      .then(async () => {
        if (this.closed) {
          return
        }
        await this.window.webContents.executeJavaScript(
          `globalThis.__orcaFeedVideo(${JSON.stringify(encoded)},${frame.config},${frame.keyFrame})`
        )
      })
      .catch((error: unknown) => {
        this.failure = error
      })
      .finally(() => {
        this.queued -= 1
      })
  }

  async takeImage(): Promise<{
    image: string
    width: number
    height: number
    deviceWidth: number
    deviceHeight: number
  } | null> {
    await this.pending
    if (this.failure) {
      throw this.failure
    }
    if (this.closed) {
      return null
    }
    return this.window.webContents.executeJavaScript('globalThis.__orcaTakeImage()')
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.window.destroy()
    void rm(this.pageDirectory, { recursive: true, force: true }).catch(() => {})
  }
}
