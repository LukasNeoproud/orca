import { build } from 'esbuild'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runProcess } from '../../src/shared/child-process/run-process'

const require = createRequire(__filename)
type Codec = 'jpeg' | 'h264' | 'hevc' | 'av1'
type Phase = 'static' | 'scrolling'
type Trial = {
  codec: Codec
  phase: Phase
  trial: number
  firstFrameMs: number
  attempts: number
  packets: number
  payloadBytes: number
  wireBytes: number
  fps: number
  latencyMs: number[]
}
type Benchmark = {
  timestamp: string
  host: Record<string, string | number>
  settings: Record<string, number>
  unavailable: string[]
  trials: Trial[]
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
}

function summary(result: Benchmark): string {
  const lines = [
    '# Mobile emulator host codec benchmark',
    '',
    `Run: ${result.timestamp}`,
    '',
    `Host: ${result.host.platform} ${result.host.release}, ${result.host.architecture}; ${result.host.cpu}; ${result.host.totalMemoryGiB} GiB RAM; Electron ${result.host.electron}, Chromium ${result.host.chrome}.`,
    '',
    `Settings: ${result.settings.width}×${result.settings.height}, ${result.settings.targetFps} fps target, ${(result.settings.videoBitRate / 1e6).toFixed(1)} Mbps video bit rate, JPEG quality ${result.settings.jpegQuality}; ${result.settings.phaseSeconds} seconds per phase, ${result.settings.trialsPerCodec} trials per codec, ${result.settings.probesPerTrial} paced latency probes per trial.`,
    '',
    '| Codec | Scene | Payload kB/s | Wire kB/s | Achieved fps | First frame ms | Feed→packet mean / p95 ms |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |'
  ]
  for (const codec of ['jpeg', 'h264', 'hevc', 'av1'] as Codec[]) {
    for (const phase of ['static', 'scrolling'] as Phase[]) {
      const rows = result.trials.filter((trial) => trial.codec === codec && trial.phase === phase)
      if (!rows.length) {
        continue
      }
      const seconds = result.settings.phaseSeconds
      const latencies = rows.flatMap((row) => row.latencyMs)
      lines.push(
        `| ${codec.toUpperCase()} | ${phase} | ${(mean(rows.map((row) => row.payloadBytes / seconds)) / 1000).toFixed(1)} | ${(mean(rows.map((row) => row.wireBytes / seconds)) / 1000).toFixed(1)} | ${mean(rows.map((row) => row.fps)).toFixed(1)} | ${mean(rows.map((row) => row.firstFrameMs)).toFixed(1)} | ${mean(latencies).toFixed(1)} / ${p95(latencies).toFixed(1)} |`
      )
    }
  }
  lines.push(
    '',
    'The scene is a generated phone-sized terminal/chat interface. Static repeats one source frame; scrolling cycles through 32 variants of text and log rows. Every codec receives the same pre-rendered JPEG input. Payload excludes framing; wire includes the production binary frame header and subscription ID. JPEG uses the production frame sender and nativeImage re-encoding; video uses the production hidden Electron WebCodecs encoder. Video startup includes hidden encoder window creation and first keyframe. Feed→packet probes are paced one at a time and include IPC, source JPEG decode, encode, and polling; they are not pure codec times.',
    '',
    'Video uses a target bit rate while JPEG uses a fixed quality setting. Visual quality was not normalized or measured, so byte rates are not equal-quality comparisons. This host test does not measure phone decode latency, battery, network delay, or end-to-end touch response. Actual Android MediaCodec fixture tests are documented separately.',
    '',
    'Reproduce from the repository root with `ORCA_BACKGROUND_LAUNCH=1 pnpm --dir mobile exec tsx ../config/scripts/run-emulator-codec-benchmark.ts`. It creates only hidden offscreen Electron windows and writes the raw JSON alongside this report.'
  )
  if (result.unavailable.length) {
    lines.push('', `Unavailable encoders: ${result.unavailable.join('; ')}`)
  }
  return `${lines.join('\n')}\n`
}

async function main(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'orca-codec-benchmark-bundle-'))
  try {
    const bundle = join(directory, 'benchmark.cjs')
    await build({
      entryPoints: [join(__dirname, 'emulator-codec-benchmark-main.ts')],
      outfile: bundle,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      external: ['electron']
    })
    const result = await runProcess({
      program: require('electron') as string,
      args: [bundle],
      env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1' },
      timeoutMs: 540_000,
      maxOutputBytes: 1_000_000
    })
    const marker = result.stdout.split('\n').find((line) => line.startsWith('BENCHMARK_JSON:'))
    process.stdout.write(result.stdout.replace(/^BENCHMARK_JSON:.*$/m, 'BENCHMARK_JSON: [saved]'))
    process.stderr.write(result.stderr)
    if (result.timedOut || result.code !== 0 || !marker) {
      throw new Error(
        `Codec benchmark failed: exit ${result.code}, signal ${result.signal}, timeout ${result.timedOut}`
      )
    }
    const benchmark = JSON.parse(marker.slice('BENCHMARK_JSON:'.length)) as Benchmark
    const out = resolve(
      process.env.ORCA_CODEC_BENCH_OUTPUT_DIR ?? join(__dirname, 'emulator-codec-benchmark-results')
    )
    await mkdir(out, { recursive: true })
    const name = `emulator-codec-benchmark-host-${benchmark.timestamp.slice(0, 10)}`
    await writeFile(join(out, `${name}.json`), `${JSON.stringify(benchmark, null, 2)}\n`)
    await writeFile(join(out, `${name}.md`), summary(benchmark))
    console.log(`Saved ${join(out, name)}.{json,md}`)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
