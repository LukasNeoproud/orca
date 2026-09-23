import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { resolvePrivateVersionCode } from '../../scripts/prepare-private-android-release.mjs'

const scriptPath = fileURLToPath(
  new URL('../../scripts/prepare-private-android-release.mjs', import.meta.url)
)
let tempDirs: string[] = []

describe('prepare private Android release', () => {
  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { force: true, recursive: true })
    }
    tempDirs = []
  })

  it('derives a monotonic version code from the workflow run and rerun attempt', () => {
    const first = resolvePrivateVersionCode({
      ORCA_PRIVATE_ANDROID_VERSION_CODE_BASE: '1000000',
      GITHUB_RUN_NUMBER: '42',
      GITHUB_RUN_ATTEMPT: '1'
    })
    const rerun = resolvePrivateVersionCode({
      ORCA_PRIVATE_ANDROID_VERSION_CODE_BASE: '1000000',
      GITHUB_RUN_NUMBER: '42',
      GITHUB_RUN_ATTEMPT: '2'
    })
    const nextRun = resolvePrivateVersionCode({
      ORCA_PRIVATE_ANDROID_VERSION_CODE_BASE: '1000000',
      GITHUB_RUN_NUMBER: '43',
      GITHUB_RUN_ATTEMPT: '1'
    })

    expect(first).toBe(1004201)
    expect(rerun).toBeGreaterThan(first)
    expect(nextRun).toBeGreaterThan(rerun)
  })

  it('supports an explicit local version code', () => {
    expect(resolvePrivateVersionCode({ ORCA_PRIVATE_ANDROID_VERSION_CODE: '2000001' })).toBe(
      2000001
    )
  })

  it('writes non-secret release outputs without mutating app.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orca-private-release-'))
    tempDirs.push(dir)
    const outputPath = join(dir, 'output.txt')

    const output = execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_OUTPUT: outputPath,
        ORCA_PRIVATE_ANDROID_PACKAGE: 'dev.example.orca.privateapp',
        ORCA_PRIVATE_ANDROID_VERSION_CODE: '2000001'
      }
    })

    expect(output).toContain('dev.example.orca.privateapp')
    expect(readFileSync(outputPath, 'utf8')).toContain('version_code=2000001')
  })
})
