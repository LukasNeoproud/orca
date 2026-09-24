import { BrowserWindow, nativeImage } from 'electron'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EmulatorVideoFrame } from '../../shared/emulator-video-protocol'
import { mobileEncoderInitialization } from './mobile-emulator-encoder-page'

type EncodedFrame = Omit<EmulatorVideoFrame, 'subscriptionId' | 'seq' | 'codec'>
type PageFrame = Omit<EncodedFrame, 'data'> & { base64: string }
type EncoderProfile = { width: number; fps: number; bitRate?: number }

export class MobileEmulatorVideoEncoder {
  private closed = false
  private busy = false
  private latestJpeg: Buffer | null = null
  private failure: unknown = null

  private constructor(
    private readonly window: BrowserWindow,
    private readonly directory: string
  ) {}

  static async create(
    codec: EmulatorVideoFrame['codec'],
    profile: EncoderProfile,
    firstJpeg: Buffer
  ): Promise<MobileEmulatorVideoEncoder> {
    const size = nativeImage.createFromBuffer(firstJpeg).getSize()
    if (!size.width || !size.height) {
      throw new Error('Invalid simulator image')
    }
    const scale = Math.min(1, profile.width / size.width)
    const width = Math.max(2, Math.floor((size.width * scale) / 2) * 2)
    const height = Math.max(2, Math.floor((size.height * scale) / 2) * 2)
    const directory = await mkdtemp(join(tmpdir(), 'orca-emulator-encoder-'))
    let window: BrowserWindow | null = null
    try {
      const page = join(directory, 'encoder.html')
      await writeFile(page, '<!doctype html><meta charset="utf-8">', { mode: 0o600 })
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
      await window.loadFile(page)
      await executeEncoderPage(
        window,
        mobileEncoderInitialization({
          codec,
          width,
          height,
          fps: profile.fps,
          bitrate: profile.bitRate ?? 2_000_000,
          maxWidth: profile.width
        })
      )
      await executeEncoderPage(
        window,
        `globalThis.__orcaEncodeJpeg(${JSON.stringify(firstJpeg.toString('base64'))}, true).catch(error => { throw new Error(String(error)) })`
      )
      return new MobileEmulatorVideoEncoder(window, directory)
    } catch (error) {
      window?.destroy()
      await rm(directory, { recursive: true, force: true })
      throw error
    }
  }

  feedJpeg(jpeg: Buffer): void {
    if (this.closed || this.failure) {
      return
    }
    this.latestJpeg = jpeg
    if (!this.busy) {
      void this.drain()
    }
  }

  private async drain(): Promise<void> {
    this.busy = true
    try {
      while (!this.closed && this.latestJpeg) {
        const jpeg = this.latestJpeg
        this.latestJpeg = null
        await executeEncoderPage(
          this.window,
          `globalThis.__orcaEncodeJpeg(${JSON.stringify(jpeg.toString('base64'))}, false)`
        )
      }
    } catch (error) {
      if (!this.closed) {
        this.failure = error
      }
    } finally {
      this.busy = false
    }
  }

  async takeFrames(): Promise<EncodedFrame[]> {
    if (this.failure) {
      throw this.failure
    }
    if (this.closed) {
      return []
    }
    const frames: PageFrame[] = await executeEncoderPage(
      this.window,
      'globalThis.__orcaTakeEncodedFrames()'
    )
    return frames.map(({ base64, ...frame }) => ({ ...frame, data: Buffer.from(base64, 'base64') }))
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.latestJpeg = null
    this.window.destroy()
    void rm(this.directory, { recursive: true, force: true }).catch(() => {})
  }
}

async function executeEncoderPage<T>(window: BrowserWindow, expression: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let result: { value?: T; error?: string }
  try {
    result = await Promise.race([
      window.webContents.executeJavaScript(`(async () => {
        try { return { value: await (${expression}) } }
        catch (error) { return { error: String(error) } }
      })()`),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Video encoder timed out')), 10_000)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
  if (result.error) {
    throw new Error(result.error)
  }
  return result.value as T
}
