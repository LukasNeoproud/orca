import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { devLaunchConfiguration, launchDevApp, plistString } from './macos-dev-launcher.mjs'

const temporaryDirs = []
afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})
function configuration() {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'orca-launcher-'))
  temporaryDirs.push(repoRoot)
  return {
    repoRoot,
    logDirectory: path.join(repoRoot, 'logs'),
    nodePath: '/node/bin/node',
    pnpmPath: '/node/bin/pnpm',
    searchPath: '/usr/bin:/bin'
  }
}

describe('macOS dev launcher', () => {
  it('isolates its profile and explicitly disables inherited background launch', () => {
    const options = configuration()
    const { plist, label } = devLaunchConfiguration(options)
    expect(plist).toContain('Application Support/orca-dev')
    expect(plist).toContain('<key>ORCA_BACKGROUND_LAUNCH</key><string>0</string>')
    expect(plist).toContain('<string>/node/bin/pnpm</string><string>dev</string>')
    expect(devLaunchConfiguration({ ...options, background: true }).plist).toContain(
      '<key>ORCA_BACKGROUND_LAUNCH</key><string>1</string>'
    )
    expect(devLaunchConfiguration(options).label).toBe(label)
    expect(plistString('A & <B>')).toBe('<string>A &amp; &lt;B&gt;</string>')
  })

  it('puts default launch logs outside the protected repository', () => {
    const options = configuration()
    delete options.logDirectory
    const { outputDir, plist } = devLaunchConfiguration(options)
    expect(outputDir).toContain(path.join('Library', 'Logs', 'Orca Dev'))
    expect(outputDir.startsWith(options.repoRoot)).toBe(false)
    expect(plist).toContain(plistString(path.join(outputDir, 'dev.log')))
  })

  it('keeps an already-running service intact', () => {
    const calls = []
    launchDevApp({ ...configuration(), background: true }, (command, args) => {
      calls.push([command, ...args])
      return 'state = running\n pid = 1234\n'
    })
    expect(calls.map((call) => call[1])).toEqual(['print', 'kickstart'])
    expect(calls.flat()).not.toContain('-k')
  })

  it('replaces a stopped service configuration before starting again', () => {
    const calls = []
    const options = configuration()
    const result = launchDevApp(options, (command, args) => {
      calls.push([command, ...args])
      return 'state = not running\n'
    })
    expect(calls.map((call) => call[1])).toEqual(['print', 'bootout', 'bootstrap', 'kickstart'])
    const plistPath = calls.find((call) => call[1] === 'bootstrap')[3]
    expect(readFileSync(plistPath, 'utf8')).toContain(
      '<key>ORCA_BACKGROUND_LAUNCH</key><string>0</string>'
    )
    expect(result.service).toContain('com.stablyai.orca.dev-launcher.')
  })
})
