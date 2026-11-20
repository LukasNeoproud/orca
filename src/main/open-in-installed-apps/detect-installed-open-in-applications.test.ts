import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  detectInstalledOpenInApplications,
  type OpenInDetectionDeps
} from './detect-installed-open-in-applications'
import { resolveExternalEditorLaunchSpec } from '../external-editor-launch'
import { KNOWN_OPEN_IN_APPLICATIONS } from '../../shared/open-in-known-applications'

type FakeDisk = {
  launchers?: string[]
  files?: string[]
  folders?: string[]
  env?: Record<string, string | undefined>
}

function fakeDeps(
  platform: NodeJS.Platform,
  homePath: string,
  disk: FakeDisk
): OpenInDetectionDeps {
  const files = new Set(disk.files ?? [])
  const folders = new Set(disk.folders ?? [])
  const separator = platform === 'win32' ? '\\' : '/'
  return {
    platform,
    homePath,
    env: disk.env ?? {},
    hasLauncher: (name) => (disk.launchers ?? []).includes(name),
    isFile: async (candidate) => files.has(candidate),
    isDirectory: async (candidate) => folders.has(candidate),
    listDirectory: async (parent) =>
      [...files, ...folders]
        .filter((entry) => entry.startsWith(`${parent}${separator}`))
        .map((entry) => entry.slice(parent.length + 1).split(separator)[0] ?? '')
  }
}

describe('detectInstalledOpenInApplications on macOS', () => {
  const home = '/Users/ada'

  it('offers Android Studio by its launcher when the Toolbox script is on PATH', async () => {
    const deps = fakeDeps('darwin', home, {
      launchers: ['code', 'studio'],
      folders: [`${home}/Applications/Android Studio.app`]
    })
    await expect(detectInstalledOpenInApplications(deps)).resolves.toEqual([
      { id: 'vscode', label: 'VS Code', command: 'code' },
      { id: 'android-studio', label: 'Android Studio', command: 'studio' }
    ])
  })

  it('uses the Toolbox script when its folder is not on PATH', async () => {
    const script = `${home}/Library/Application Support/JetBrains/Toolbox/scripts/studio`
    const deps = fakeDeps('darwin', home, { files: [script] })
    await expect(detectInstalledOpenInApplications(deps)).resolves.toEqual([
      { id: 'android-studio', label: 'Android Studio', command: script }
    ])
  })

  it('falls back to the launcher inside the app bundle', async () => {
    const bundle = '/Applications/IntelliJ IDEA CE.app'
    const vscode = '/Applications/Visual Studio Code.app'
    const deps = fakeDeps('darwin', home, {
      folders: [bundle, vscode],
      files: [`${bundle}/Contents/MacOS/idea`, `${vscode}/Contents/Resources/app/bin/code`]
    })
    await expect(detectInstalledOpenInApplications(deps)).resolves.toEqual([
      { id: 'vscode', label: 'VS Code', command: `${vscode}/Contents/Resources/app/bin/code` },
      { id: 'intellij-idea', label: 'IntelliJ IDEA', command: `${bundle}/Contents/MacOS/idea` }
    ])
  })

  it('finds bundles in the older JetBrains Toolbox applications folder', async () => {
    const bundle = `${home}/Applications/JetBrains Toolbox/Rider.app`
    const deps = fakeDeps('darwin', home, {
      folders: [bundle],
      files: [`${bundle}/Contents/MacOS/rider`]
    })
    await expect(detectInstalledOpenInApplications(deps)).resolves.toEqual([
      { id: 'rider', label: 'Rider', command: `${bundle}/Contents/MacOS/rider` }
    ])
  })

  it('offers Xcode only when the app is installed, not for the xed stub alone', async () => {
    await expect(
      detectInstalledOpenInApplications(fakeDeps('darwin', home, { launchers: ['xed'] }))
    ).resolves.toEqual([])
    await expect(
      detectInstalledOpenInApplications(
        fakeDeps('darwin', home, { launchers: ['xed'], folders: ['/Applications/Xcode.app'] })
      )
    ).resolves.toEqual([{ id: 'xcode', label: 'Xcode', command: 'xed' }])
  })

  it('offers nothing for a bundle whose launcher is missing', async () => {
    const deps = fakeDeps('darwin', home, { folders: ['/Applications/Android Studio.app'] })
    await expect(detectInstalledOpenInApplications(deps)).resolves.toEqual([])
  })
})

describe('detectInstalledOpenInApplications on Linux', () => {
  const home = '/home/ada'

  it('uses the Toolbox script folder and the Android Studio tarball', async () => {
    const script = `${home}/.local/share/JetBrains/Toolbox/scripts/pycharm`
    const deps = fakeDeps('linux', home, {
      files: [script, `${home}/android-studio/bin/studio.sh`]
    })
    await expect(detectInstalledOpenInApplications(deps)).resolves.toEqual([
      {
        id: 'android-studio',
        label: 'Android Studio',
        command: `${home}/android-studio/bin/studio.sh`
      },
      { id: 'pycharm', label: 'PyCharm', command: script }
    ])
  })

  it('accepts a snap launcher name and never offers Xcode', async () => {
    const deps = fakeDeps('linux', home, {
      launchers: ['android-studio', 'xed', 'zeditor'],
      folders: ['/Applications/Xcode.app']
    })
    await expect(detectInstalledOpenInApplications(deps)).resolves.toEqual([
      { id: 'zed', label: 'Zed', command: 'zeditor' },
      { id: 'android-studio', label: 'Android Studio', command: 'android-studio' }
    ])
  })
})

describe('detectInstalledOpenInApplications on Windows', () => {
  const home = 'C:\\Users\\Ada'
  const env = {
    LOCALAPPDATA: 'C:\\Users\\Ada\\AppData\\Local',
    ProgramFiles: 'C:\\Program Files'
  }

  it('finds Toolbox scripts, the Android Studio installer and versioned JetBrains folders', async () => {
    const deps = fakeDeps('win32', home, {
      env,
      files: [
        'C:\\Users\\Ada\\AppData\\Local\\JetBrains\\Toolbox\\scripts\\rider.cmd',
        'C:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe',
        'C:\\Program Files\\JetBrains\\IntelliJ IDEA 2026.1\\bin\\idea64.exe',
        'C:\\Program Files\\JetBrains\\IntelliJ IDEA 2026.10\\bin\\idea64.exe',
        'C:\\Users\\Ada\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd'
      ],
      folders: ['C:\\Program Files\\JetBrains\\IntelliJ IDEA 2025.3']
    })
    await expect(detectInstalledOpenInApplications(deps)).resolves.toEqual([
      {
        id: 'vscode',
        label: 'VS Code',
        command: 'C:\\Users\\Ada\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd'
      },
      {
        id: 'android-studio',
        label: 'Android Studio',
        command: 'C:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe'
      },
      {
        id: 'intellij-idea',
        label: 'IntelliJ IDEA',
        command: 'C:\\Program Files\\JetBrains\\IntelliJ IDEA 2026.10\\bin\\idea64.exe'
      },
      {
        id: 'rider',
        label: 'Rider',
        command: 'C:\\Users\\Ada\\AppData\\Local\\JetBrains\\Toolbox\\scripts\\rider.cmd'
      }
    ])
  })

  it('prefers a launcher on PATH, including the GUI binary name', async () => {
    const deps = fakeDeps('win32', home, { env, launchers: ['code', 'studio64'] })
    await expect(detectInstalledOpenInApplications(deps)).resolves.toEqual([
      { id: 'vscode', label: 'VS Code', command: 'code' },
      { id: 'android-studio', label: 'Android Studio', command: 'studio64' }
    ])
  })

  it('skips locations whose environment variable is missing', async () => {
    const deps = fakeDeps('win32', home, {
      files: [
        '\\JetBrains\\Toolbox\\scripts\\studio.cmd',
        '\\Android\\Android Studio\\bin\\studio64.exe'
      ]
    })
    await expect(detectInstalledOpenInApplications(deps)).resolves.toEqual([])
  })

  it('keeps the editors it found when one location throws', async () => {
    const deps = fakeDeps('win32', home, { env, launchers: ['code'] })
    deps.listDirectory = async () => {
      throw new Error('EACCES')
    }
    await expect(detectInstalledOpenInApplications(deps)).resolves.toEqual([
      { id: 'vscode', label: 'VS Code', command: 'code' }
    ])
  })
})

describe('detectInstalledOpenInApplications against the disk', () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(path.join(os.tmpdir(), 'orca-open-in-detect-'))
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it.skipIf(process.platform === 'win32')(
    'offers an executable Toolbox script and ignores one that cannot run',
    async () => {
      const scripts = path.join(home, '.local', 'share', 'JetBrains', 'Toolbox', 'scripts')
      mkdirSync(scripts, { recursive: true })
      writeFileSync(path.join(scripts, 'studio'), '#!/bin/sh\n', { mode: 0o755 })
      writeFileSync(path.join(scripts, 'idea'), '#!/bin/sh\n', { mode: 0o644 })
      await expect(
        detectInstalledOpenInApplications({
          platform: 'linux',
          homePath: home,
          env: {},
          hasLauncher: () => false
        })
      ).resolves.toEqual([
        { id: 'android-studio', label: 'Android Studio', command: path.join(scripts, 'studio') }
      ])
    }
  )
})

describe('every known editor', () => {
  const location = { line: 42, column: 7 }

  it.each(
    KNOWN_OPEN_IN_APPLICATIONS.flatMap((app) =>
      [app.command, ...(app.aliases ?? [])].map((name) => [app.id, name] as const)
    )
  )('%s opens a file at a line through %s', (_id, name) => {
    const platform = name === 'xed' ? 'darwin' : 'linux'
    const file = '/home/ada/repo/App.kt'
    const { spawnArgs } = resolveExternalEditorLaunchSpec(name, file, {
      platform,
      location,
      fileExists: () => false
    })
    expect(spawnArgs).not.toEqual([file])
    expect(spawnArgs.join(' ')).toContain('42')
  })
})
