import { app, BrowserWindow } from 'electron'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { cpus, freemem, platform, release, tmpdir, totalmem } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { decodeBrowserScreencastFrame } from '../../src/shared/browser-screencast-protocol'
import {
  encodeEmulatorVideoFrame,
  type EmulatorVideoCodec
} from '../../src/shared/emulator-video-protocol'
import { MobileEmulatorFrameSender } from '../../src/main/emulator/mobile-emulator-frame-sender'
import { MobileEmulatorVideoEncoder } from '../../src/main/emulator/mobile-emulator-video-encoder'
import { applyBackgroundActivationPolicy } from '../../src/main/window/foreground-activation-policy'
import {
  percentile,
  trialResult,
  type Packet,
  type Phase,
  type Trial
} from './emulator-codec-benchmark-metrics'
import { emulatorCodecBenchmarkScene } from './emulator-codec-benchmark-scene'

if (process.env.ORCA_BACKGROUND_LAUNCH !== '1') {
  throw new Error('Codec benchmark requires background launch')
}
applyBackgroundActivationPolicy()

const WIDTH = 900
const HEIGHT = 1600
const FPS = 15
const BIT_RATE = 2_500_000
const JPEG_QUALITY = 60
const PHASE_MS = Number(process.env.ORCA_CODEC_BENCH_PHASE_MS ?? 8_000)
const PROBES = Number(process.env.ORCA_CODEC_BENCH_PROBES ?? 20)
const TRIALS = Number(process.env.ORCA_CODEC_BENCH_TRIALS ?? 3)
if (
  !Number.isInteger(PHASE_MS) ||
  PHASE_MS < 1_000 ||
  !Number.isInteger(PROBES) ||
  PROBES < 1 ||
  !Number.isInteger(TRIALS) ||
  TRIALS < 1
) {
  throw new Error('Invalid codec benchmark duration, probe count, or trial count')
}
const CODECS = ['jpeg', 'h264', 'hevc', 'av1'] as const

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
async function sleepUntil(target: number): Promise<void> {
  const remaining = target - performance.now()
  if (remaining > 0) {
    await sleep(remaining)
  }
}

async function runJpeg(source: Buffer[], phase: Phase, trial: number): Promise<Trial> {
  const packets: Packet[] = []
  const sender = new MobileEmulatorFrameSender(
    { width: WIDTH, fps: FPS, jpegQuality: JPEG_QUALITY },
    (bytes) => {
      const decoded = decodeBrowserScreencastFrame(bytes)
      if (!decoded) {
        throw new Error('Invalid JPEG frame from production sender')
      }
      packets.push({ payloadBytes: decoded.image.byteLength, wireBytes: bytes.byteLength })
      return true
    }
  )
  const firstAt = performance.now()
  sender.queueIosFrame(source[0])
  const firstFrameMs = performance.now() - firstAt
  const startupPayloadBytes = packets[0]?.payloadBytes ?? 0
  if (!startupPayloadBytes) {
    throw new Error('JPEG startup produced no frame')
  }
  packets.length = 0
  await sleep(80)
  const started = performance.now()
  const slots = Math.floor((PHASE_MS / 1000) * FPS)
  for (let index = 0; index < slots; index++) {
    await sleepUntil(started + (index * 1000) / FPS)
    sender.queueIosFrame(source[phase === 'static' ? 0 : index % source.length])
  }
  const phasePackets = packets.splice(0)
  const latencyMs: number[] = []
  for (let index = 0; index < PROBES; index++) {
    await sleep(80)
    const before = performance.now()
    sender.queueIosFrame(source[index % source.length])
    if (!packets.length) {
      throw new Error('JPEG probe frame was throttled')
    }
    latencyMs.push(performance.now() - before)
    packets.length = 0
  }
  sender.stop()
  return trialResult(
    'jpeg',
    phase,
    trial,
    firstFrameMs,
    startupPayloadBytes,
    slots,
    phasePackets,
    latencyMs,
    PHASE_MS
  )
}

async function runVideo(
  codec: EmulatorVideoCodec,
  source: Buffer[],
  phase: Phase,
  trial: number
): Promise<Trial> {
  const firstAt = performance.now()
  const encoder = await MobileEmulatorVideoEncoder.create(
    codec,
    { width: WIDTH, fps: FPS, bitRate: BIT_RATE },
    source[0]
  )
  try {
    const startup = await encoder.takeFrames()
    const firstFrameMs = performance.now() - firstAt
    if (!startup.some((frame) => frame.keyFrame)) {
      throw new Error(`${codec} has no startup keyframe`)
    }
    const startupPayloadBytes = startup.reduce((sum, frame) => sum + frame.data.byteLength, 0)
    await sleep(80)
    const phasePackets: Packet[] = []
    const started = performance.now()
    const slots = Math.floor((PHASE_MS / 1000) * FPS)
    const capture = async (): Promise<void> => {
      const frames = await encoder.takeFrames()
      for (const frame of frames) {
        phasePackets.push({
          payloadBytes: frame.data.byteLength,
          wireBytes: encodeEmulatorVideoFrame({
            ...frame,
            codec,
            subscriptionId: 'benchmark-subscription',
            seq: phasePackets.length
          }).byteLength
        })
      }
    }
    for (let index = 0; index < slots; index++) {
      await sleepUntil(started + (index * 1000) / FPS)
      encoder.feedJpeg(source[phase === 'static' ? 0 : index % source.length])
      await capture()
    }
    for (let drain = 0; drain < 5; drain++) {
      await sleep(40)
      await capture()
    }
    const latencyMs: number[] = []
    for (let index = 0; index < PROBES; index++) {
      await sleep(80)
      await encoder.takeFrames()
      const before = performance.now()
      encoder.feedJpeg(source[index % source.length])
      let found = false
      const deadline = performance.now() + 1_000
      while (performance.now() < deadline) {
        await sleep(5)
        const frames = await encoder.takeFrames()
        if (frames.length > 0) {
          latencyMs.push(performance.now() - before)
          found = true
          break
        }
      }
      if (!found) {
        throw new Error(`${codec} probe timed out`)
      }
    }
    return trialResult(
      codec,
      phase,
      trial,
      firstFrameMs,
      startupPayloadBytes,
      slots,
      phasePackets,
      latencyMs,
      PHASE_MS
    )
  } finally {
    encoder.close()
  }
}

async function main(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'orca-codec-benchmark-'))
  app.setPath('userData', directory)
  let window: BrowserWindow | null = null
  const deadline = setTimeout(() => app.exit(124), 480_000)
  try {
    await app.whenReady()
    const page = join(directory, 'scene.html')
    await writeFile(page, '<!doctype html><meta charset="utf-8">', { mode: 0o600 })
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
    const images: string[] = await window.webContents.executeJavaScript(
      emulatorCodecBenchmarkScene(WIDTH, HEIGHT)
    )
    const source = images.map((image) => Buffer.from(image, 'base64'))
    const trials: Trial[] = []
    const unavailable: string[] = []
    for (let trial = 0; trial < TRIALS; trial++) {
      const ordered = [...CODECS.slice(trial), ...CODECS.slice(0, trial)]
      for (const codec of ordered) {
        for (const phase of (trial % 2
          ? ['scrolling', 'static']
          : ['static', 'scrolling']) as Phase[]) {
          try {
            const result =
              codec === 'jpeg'
                ? await runJpeg(source, phase, trial + 1)
                : await runVideo(codec, source, phase, trial + 1)
            trials.push(result)
            console.log(
              `TRIAL ${trial + 1} ${codec} ${phase}: ${result.packets} packets, ${result.payloadBytes} bytes, p95 ${percentile(result.latencyMs, 0.95).toFixed(1)} ms`
            )
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            if (message.includes('encoding is unavailable')) {
              unavailable.push(`${codec}: ${message}`)
              continue
            }
            throw error
          }
        }
      }
    }
    const result = {
      benchmark: 'orca-mobile-emulator-codecs',
      timestamp: new Date().toISOString(),
      host: {
        platform: platform(),
        release: release(),
        architecture: process.arch,
        cpu: cpus()[0]?.model ?? 'unknown',
        totalMemoryGiB: +(totalmem() / 2 ** 30).toFixed(1),
        freeMemoryGiBAtFinish: +(freemem() / 2 ** 30).toFixed(1),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node
      },
      settings: {
        width: WIDTH,
        height: HEIGHT,
        targetFps: FPS,
        videoBitRate: BIT_RATE,
        jpegQuality: JPEG_QUALITY,
        sourceJpegQuality: 92,
        phaseSeconds: PHASE_MS / 1000,
        probesPerTrial: PROBES,
        trialsPerCodec: TRIALS
      },
      unavailable,
      trials
    }
    console.log(`BENCHMARK_JSON:${JSON.stringify(result)}`)
  } finally {
    clearTimeout(deadline)
    window?.destroy()
    await rm(directory, { recursive: true, force: true })
  }
}

void main().then(
  () => {
    app.exit(0)
  },
  (error: unknown) => {
    console.error(error)
    app.exit(1)
  }
)
