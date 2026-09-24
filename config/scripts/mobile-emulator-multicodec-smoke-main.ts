import { app, BrowserWindow, nativeImage } from 'electron'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MobileEmulatorVideoEncoder } from '../../src/main/emulator/mobile-emulator-video-encoder'
import { applyBackgroundActivationPolicy } from '../../src/main/window/foreground-activation-policy'

if (process.env.ORCA_BACKGROUND_LAUNCH !== '1') {
  throw new Error('Codec smoke requires background launch')
}
applyBackgroundActivationPolicy()

async function decodeFrames(
  window: BrowserWindow,
  codec: 'h264' | 'hevc' | 'av1',
  frames: { data: Uint8Array; keyFrame: boolean; timestampUs: number }[],
  width: number,
  height: number
): Promise<{ outputs: number; rgba: number[]; dimensions: number[]; error?: string }> {
  const chunks = frames.map((frame) => ({
    data: Buffer.from(frame.data).toString('base64'),
    keyFrame: frame.keyFrame,
    timestamp: frame.timestampUs
  }))
  return window.webContents.executeJavaScript(`(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = ${width}; canvas.height = ${height}
    const context = canvas.getContext('2d')
    let outputs = 0
    let dimensions = []
    let failure = null
    const decoder = new VideoDecoder({
      output(frame) {
        try {
          dimensions = [frame.displayWidth, frame.displayHeight]
          context.drawImage(frame, 0, 0)
          outputs++
        } finally { frame.close() }
      },
      error(error) { failure = error.message }
    })
    try {
      decoder.configure({
        codec: ${JSON.stringify({ h264: 'avc1.420033', hevc: 'hvc1.1.6.L153.B0', av1: 'av01.0.08M.08' }[codec])},
        optimizeForLatency: true, codedWidth: ${width}, codedHeight: ${height},
        hardwareAcceleration: ${JSON.stringify(codec === 'av1' ? 'prefer-software' : 'no-preference')}
      })
      for (const chunk of ${JSON.stringify(chunks)}) {
        decoder.decode(new EncodedVideoChunk({
          type: chunk.keyFrame ? 'key' : 'delta', timestamp: chunk.timestamp,
          data: Uint8Array.from(atob(chunk.data), character => character.charCodeAt(0))
        }))
      }
      try { await decoder.flush() } catch (error) { throw new Error(failure || String(error)) }
      if (failure) throw new Error(failure)
      return { outputs, dimensions, rgba: Array.from(context.getImageData(0, 0, 1, 1).data) }
    } finally { if (decoder.state !== 'closed') decoder.close() }
  })().catch(error => ({ error: String(error) }))`)
}

async function main(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'orca-multicodec-smoke-'))
  app.setPath('userData', directory)
  let window: BrowserWindow | null = null
  let encoder: MobileEmulatorVideoEncoder | null = null
  async function finish(code: number): Promise<void> {
    encoder?.close()
    window?.destroy()
    await rm(directory, { recursive: true, force: true })
    app.exit(code)
  }
  const deadline = setTimeout(() => void finish(124), 30_000)
  await app.whenReady()
  try {
    const page = join(directory, 'decoder.html')
    await writeFile(page, '<!doctype html><meta charset="utf-8">')
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: true
      }
    })
    await window.loadFile(page)
    const pixels = Buffer.alloc(640 * 480 * 4)
    for (let i = 0; i < pixels.length; i += 4) {
      pixels.set([32, 48, 224, 255], i)
    }
    const jpeg = nativeImage.createFromBitmap(pixels, { width: 640, height: 480 }).toJPEG(90)
    const codecs = ['h264', 'hevc', 'av1'] as const
    let passed = 0
    for (const codec of codecs) {
      try {
        encoder = await MobileEmulatorVideoEncoder.create(codec, { width: 640, fps: 10 }, jpeg)
      } catch (error) {
        if (error instanceof Error && error.message.includes('encoding is unavailable')) {
          console.log(`UNAVAILABLE: ${codec} encoder on this host; JPEG fallback required`)
          continue
        }
        throw error
      }
      const frames = await encoder.takeFrames()
      if (!frames.length || !frames.some((frame) => frame.keyFrame)) {
        throw new Error(`${codec}: missing first keyframe`)
      }
      if (process.env.ORCA_CODEC_FIXTURE_DIR) {
        await mkdir(process.env.ORCA_CODEC_FIXTURE_DIR, { recursive: true })
        await writeFile(
          join(process.env.ORCA_CODEC_FIXTURE_DIR, `${codec}.bin`),
          Buffer.concat(frames.map((frame) => Buffer.from(frame.data)))
        )
      }
      for (let update = 0; update < 2; update++) {
        await new Promise((resolve) => setTimeout(resolve, 130))
        encoder.feedJpeg(jpeg)
        let arrived = false
        for (let attempt = 0; attempt < 50; attempt++) {
          const next = await encoder.takeFrames()
          if (next.length) {
            frames.push(...next)
            arrived = true
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        if (!arrived) {
          throw new Error(`${codec}: subsequent frame did not encode`)
        }
      }
      console.log(
        `ENCODED: ${codec} ${frames.length} packet(s), ${frames.reduce((n, frame) => n + frame.data.byteLength, 0)} bytes`
      )
      const result = await decodeFrames(window, codec, frames, 640, 480)
      if (result.error) {
        throw new Error(`${codec}: ${result.error}`)
      }
      if (result.outputs < 3 || result.rgba[0] < 150 || result.rgba[0] < result.rgba[1]) {
        throw new Error(`${codec}: decoded pixels differ: ${JSON.stringify(result)}`)
      }
      console.log(
        `PASS: ${codec} JPEG source -> keyframe + continuing frames -> decoded red pixels`
      )
      const rotatedPixels = Buffer.alloc(480 * 640 * 4)
      for (let i = 0; i < rotatedPixels.length; i += 4) {
        rotatedPixels.set([32, 48, 224, 255], i)
      }
      const rotatedJpeg = nativeImage
        .createFromBitmap(rotatedPixels, {
          width: 480,
          height: 640
        })
        .toJPEG(90)
      await new Promise((resolve) => setTimeout(resolve, 130))
      encoder.feedJpeg(rotatedJpeg)
      const rotatedFrames: typeof frames = []
      for (let attempt = 0; attempt < 50; attempt++) {
        const next = await encoder.takeFrames()
        rotatedFrames.push(...next.filter((frame) => frame.width === 480 && frame.height === 640))
        if (rotatedFrames.some((frame) => frame.keyFrame)) {
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      if (!rotatedFrames.length || !rotatedFrames[0].keyFrame) {
        throw new Error(`${codec}: rotation did not produce a new 480x640 keyframe`)
      }
      const rotated = await decodeFrames(window, codec, rotatedFrames, 480, 640)
      if (
        rotated.error ||
        rotated.outputs < 1 ||
        rotated.dimensions[0] !== 480 ||
        rotated.dimensions[1] !== 640 ||
        rotated.rgba[0] < 150 ||
        rotated.rgba[0] < rotated.rgba[1]
      ) {
        throw new Error(`${codec}: rotated decode differs: ${JSON.stringify(rotated)}`)
      }
      console.log(`PASS: ${codec} rotation -> new 480x640 keyframe -> decoded red pixels`)
      encoder.close()
      encoder = null
      passed++
    }
    if (!passed) {
      throw new Error('No video encoder passed')
    }
    console.log('PASS: all available video codecs')
    clearTimeout(deadline)
    await finish(0)
  } catch (error) {
    console.error('SMOKE ERROR:', String(error), (error as { message?: string })?.message)
    clearTimeout(deadline)
    await finish(1)
  }
}
void main().catch((error: unknown) => {
  console.error('SMOKE ERROR:', String(error), (error as { message?: string })?.message)
  app.exit(1)
})
