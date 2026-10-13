import { describe, expect, it } from 'vitest'
import { devIconIcns, isOrcaDevRunning, parseArguments } from './build-orca-dev-app.mjs'

describe('build-orca-dev-app', () => {
  it('builds HEAD and installs by default', () => {
    expect(parseArguments([])).toEqual({ ref: 'HEAD', install: true })
    expect(parseArguments(['--ref', 'personal', '--no-install'])).toEqual({
      ref: 'personal',
      install: false
    })
    expect(() => parseArguments(['--ref'])).toThrow('--ref needs')
    expect(() => parseArguments(['--force'])).toThrow('Unknown argument')
  })

  it('wraps the dev PNG in a single ic08 icns element', () => {
    const icns = devIconIcns(Buffer.from('png'))
    expect(icns.subarray(0, 4).toString()).toBe('icns')
    expect(icns.readUInt32BE(4)).toBe(19)
    expect(icns.subarray(8, 12).toString()).toBe('ic08')
    expect(icns.subarray(16).toString()).toBe('png')
  })

  it('detects only the installed Orca Dev main executable', () => {
    const app = '/Users/me/Applications/Orca Dev.app'
    const running = () => `/sbin/launchd\n${app}/Contents/MacOS/Orca Dev --flag\n`
    const helperOnly = () =>
      `${app}/Contents/Frameworks/Orca Dev Helper.app/Contents/MacOS/Orca Dev Helper\n`
    expect(isOrcaDevRunning(app, running)).toBe(true)
    expect(isOrcaDevRunning(app, helperOnly)).toBe(false)
  })
})

describe('resolveBuildNodeBin', () => {
  it('picks the newest nvm install of the pinned major', async () => {
    const { mkdtempSync, mkdirSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { resolveBuildNodeBin } = await import('./build-orca-dev-app.mjs')
    const nvmRoot = mkdtempSync(join(tmpdir(), 'nvm-'))
    for (const version of ['v22.21.1', 'v24.9.0', 'v24.21.0']) {
      mkdirSync(join(nvmRoot, 'versions', 'node', version, 'bin'), { recursive: true })
    }
    expect(resolveBuildNodeBin('24', { currentVersion: '22.21.1', nvmRoot })).toBe(
      join(nvmRoot, 'versions', 'node', 'v24.21.0', 'bin')
    )
    expect(() => resolveBuildNodeBin('26', { currentVersion: '22.21.1', nvmRoot })).toThrow(
      'nvm install 26'
    )
  })
})
