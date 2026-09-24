import { BrowserWindow, app, nativeImage } from 'electron'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MobileEmulatorVideoDecoder } from '../../src/main/emulator/mobile-emulator-video-decoder'
import { applyBackgroundActivationPolicy } from '../../src/main/window/foreground-activation-policy'

if (process.env.ORCA_BACKGROUND_LAUNCH !== '1') {
  throw new Error('Mobile emulator codec smoke requires ORCA_BACKGROUND_LAUNCH=1')
}
const directory = mkdtempSync(join(tmpdir(), 'orca-emulator-codec-smoke-'))
mkdirSync(join(directory, 'profile'))
app.setPath('userData', join(directory, 'profile'))
applyBackgroundActivationPolicy()
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

let source: BrowserWindow | null = null
let decoder: MobileEmulatorVideoDecoder | null = null
const deadline = setTimeout(() => {
  void (async () => {
    console.error('Mobile emulator codec smoke timed out')
    decoder?.close()
    source?.destroy()
    try {
      await rm(directory, { recursive: true, force: true })
    } finally {
      app.exit(124)
    }
  })()
}, 30_000)

void app.whenReady().then(async () => {
  let exitCode = 0
  try {
    const page = join(directory, 'source.html')
    await writeFile(page, '<!doctype html><meta charset="utf-8">', { mode: 0o600 })
    source = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
        offscreen: true
      }
    })
    await source.loadFile(page)
    const chunks = (await source.webContents.executeJavaScript(`(async () => {
      if (!globalThis.VideoEncoder || !globalThis.VideoFrame) {
        throw new Error('WebCodecs H.264 encoder is unavailable')
      }
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 48
      const context = canvas.getContext('2d')
      context.fillStyle = '#e03020'
      context.fillRect(0, 0, 64, 48)
      const chunks = []
      const encoder = new VideoEncoder({
        output(chunk) {
          const bytes = new Uint8Array(chunk.byteLength)
          chunk.copyTo(bytes)
          chunks.push({ keyFrame: chunk.type === 'key', bytes: Array.from(bytes) })
        },
        error(error) { throw error }
      })
      encoder.configure({
        codec: 'avc1.640028', width: 64, height: 48, bitrate: 300000,
        framerate: 10, latencyMode: 'realtime', avc: { format: 'annexb' }
      })
      const frame = new VideoFrame(canvas, { timestamp: 0 })
      encoder.encode(frame, { keyFrame: true })
      frame.close()
      await encoder.flush()
      encoder.close()
      return chunks
    })()`)) as { keyFrame: boolean; bytes: number[] }[]
    if (chunks.length !== 1 || !chunks[0]?.keyFrame) {
      throw new Error(`Expected one Annex-B keyframe; got ${chunks.length} chunks`)
    }

    decoder = await MobileEmulatorVideoDecoder.create(64, 76, 10)
    const bytes = Uint8Array.from(chunks[0].bytes)
    decoder.feed({ config: false, keyFrame: true, pts: '0', bytes: bytes.buffer })
    let jpeg: Awaited<ReturnType<MobileEmulatorVideoDecoder['takeImage']>> = null
    for (let attempt = 0; attempt < 40 && !jpeg; attempt++) {
      jpeg = await decoder.takeImage()
      if (!jpeg) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }
    if (!jpeg) {
      throw new Error('Single H.264 keyframe produced no JPEG')
    }
    const image = nativeImage.createFromBuffer(Buffer.from(jpeg.image, 'base64'))
    const size = image.getSize()
    const pixel = image.toBitmap().subarray(0, 4)
    if (
      size.width !== 64 ||
      size.height !== 48 ||
      jpeg.width !== 64 ||
      jpeg.height !== 48 ||
      pixel[2]! < 130 ||
      pixel[2]! <= pixel[1]! ||
      pixel[1]! <= pixel[0]!
    ) {
      throw new Error(`Invalid JPEG: ${JSON.stringify({ size, pixel: Array.from(pixel) })}`)
    }
    console.log(`PASS: single H.264 keyframe -> ${size.width}x${size.height} JPEG`)
  } catch (error) {
    console.error(error)
    exitCode = 1
  } finally {
    clearTimeout(deadline)
    decoder?.close()
    source?.destroy()
    await rm(directory, { recursive: true, force: true })
    app.exit(exitCode)
  }
})
