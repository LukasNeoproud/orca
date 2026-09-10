import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { getDevBundleProcessTable, isDevBundleInUse } from './dev-electron-bundle-cache.mjs'

export function plistString(value) {
  return `<string>${String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character])}</string>`
}

export function devLaunchConfiguration({
  repoRoot,
  nodePath,
  pnpmPath,
  searchPath,
  background = false
}) {
  const label = `com.stablyai.orca.dev-launcher.${createHash('sha256').update(repoRoot).digest('hex').slice(0, 12)}`
  const outputDir = path.join(repoRoot, 'out', 'macos-dev-launcher')
  const environment = {
    PATH: `${path.dirname(nodePath)}:${searchPath}`,
    HOME: homedir(),
    ORCA_DEV_USER_DATA_PATH: path.join(homedir(), 'Library', 'Application Support', 'orca-dev'),
    ORCA_DEV_DOCK_TITLE: 'Orca Dev',
    ORCA_DEV_INSTANCE_LABEL: 'Orca Dev'
  }
  environment.ORCA_BACKGROUND_LAUNCH = background ? '1' : '0'
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key>${plistString(label)}
<key>ProgramArguments</key><array>${[pnpmPath, 'dev'].map(plistString).join('')}</array>
<key>WorkingDirectory</key>${plistString(repoRoot)}
<key>EnvironmentVariables</key><dict>${Object.entries(environment)
    .map(([key, value]) => `<key>${key}</key>${plistString(value)}`)
    .join('')}</dict>
<key>StandardOutPath</key>${plistString(path.join(outputDir, 'dev.log'))}
<key>StandardErrorPath</key>${plistString(path.join(outputDir, 'dev.log'))}
<key>ProcessType</key><string>Interactive</string>
</dict></plist>\n`
  return { label, outputDir, plist }
}

function findDevBundle(repoRoot, run) {
  const processTable = getDevBundleProcessTable(run)
  if (processTable === null) {
    return null
  }
  const bundlesDir = path.join(repoRoot, 'out', 'electron-dev')
  try {
    for (const entry of readdirSync(bundlesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }
      if (!isDevBundleInUse(path.join(bundlesDir, entry.name), processTable)) {
        continue
      }
      const appPath = path.join(bundlesDir, entry.name, 'Orca Dev.app')
      try {
        readFileSync(path.join(appPath, 'Contents', 'Info.plist'))
        return appPath
      } catch {}
    }
  } catch {}
  return null
}

export function launchDevApp(options, run = execFileSync) {
  const { label, outputDir, plist } = devLaunchConfiguration(options)
  const domain = `gui/${process.getuid()}`
  const service = `${domain}/${label}`
  mkdirSync(outputDir, { recursive: true })
  let loaded = false
  let running = false
  try {
    const state = run('/bin/launchctl', ['print', service], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    loaded = true
    running = /^\s*pid = \d+/m.test(state)
  } catch {}
  if (loaded && !running) {
    run('/bin/launchctl', ['bootout', service], { stdio: 'pipe' })
    loaded = false
  }
  if (!loaded) {
    const plistPath = path.join(outputDir, `${label}.plist`)
    writeFileSync(plistPath, plist)
    try {
      run('/bin/launchctl', ['bootstrap', domain, plistPath], { stdio: 'pipe' })
    } catch (error) {
      // Another simultaneous Raycast launch may already have bootstrapped the same label.
      try {
        run('/bin/launchctl', ['print', service], { stdio: 'pipe' })
      } catch {
        throw error
      }
    }
  }
  run('/bin/launchctl', ['kickstart', service], { stdio: 'pipe' })
  if (running && !options.background) {
    const appPath = findDevBundle(options.repoRoot, run)
    if (appPath) {
      run('/usr/bin/open', ['-a', appPath, '--args', options.repoRoot], { stdio: 'pipe' })
    }
  }
  return { service, outputDir }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  if (process.platform !== 'darwin') {
    throw new Error('The Raycast launcher requires macOS.')
  }
  const options = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  options.background = process.argv.includes('--background')
  const result = launchDevApp(options)
  console.log(`Orca Dev: ${result.service}; logs: ${path.join(result.outputDir, 'dev.log')}`)
}
