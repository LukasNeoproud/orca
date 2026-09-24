import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '../../src/shared/child-process/run-process'

const require = createRequire(__filename)

async function main(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'orca-emulator-codec-bundle-'))
  try {
    const bundle = join(directory, 'smoke.cjs')
    await build({
      entryPoints: [
        join(
          __dirname,
          process.argv.includes('--all-codecs')
            ? 'mobile-emulator-multicodec-smoke-main.ts'
            : 'mobile-emulator-codec-smoke-main.ts'
        )
      ],
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
      timeoutMs: 35_000,
      maxOutputBytes: 32_000
    })
    process.stdout.write(result.stdout)
    process.stderr.write(result.stderr)
    if (
      result.timedOut ||
      result.code !== 0 ||
      !result.stdout.includes(
        process.argv.includes('--all-codecs')
          ? 'PASS: all available video codecs'
          : 'PASS: single H.264'
      )
    ) {
      process.exitCode = 1
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
