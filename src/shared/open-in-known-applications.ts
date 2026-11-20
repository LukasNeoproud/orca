/** Editors Orca can open a file in at a line; the Open in settings offer them once installed. */
export type KnownOpenInApplication = {
  id: string
  label: string
  /** The launcher a user types in a terminal, stored as the command when it resolves. */
  command: string
  /** Other launcher names of the same editor: Windows GUI binaries, Linux packages. */
  aliases?: readonly string[]
  faviconDomain: string
  /** Platforms where the editor exists; every platform when unset. */
  platforms?: readonly NodeJS.Platform[]
  mac?: {
    bundles: readonly string[]
    /** Launcher inside the bundle; without it the bundle only proves `command` belongs to it. */
    executable?: string
  }
  /** JetBrains Toolbox writes a script under its launcher name when shell scripts are on. */
  toolboxScript?: boolean
  /** Install locations off PATH; `~`, `%LOCALAPPDATA%` and `%ProgramFiles%` expand, `*` ends a segment. */
  installPaths?: { win32?: readonly string[]; linux?: readonly string[] }
}

function jetBrainsIde(args: {
  id: string
  label: string
  command: string
  bundles: readonly string[]
  windowsFolder: string
  aliases?: readonly string[]
}): KnownOpenInApplication {
  return {
    id: args.id,
    label: args.label,
    command: args.command,
    aliases: [`${args.command}64`, ...(args.aliases ?? [])],
    faviconDomain: 'jetbrains.com',
    mac: { bundles: args.bundles, executable: `Contents/MacOS/${args.command}` },
    toolboxScript: true,
    installPaths: {
      win32: [`%ProgramFiles%\\JetBrains\\${args.windowsFolder}*\\bin\\${args.command}64.exe`]
    }
  }
}

export const KNOWN_OPEN_IN_APPLICATIONS: readonly KnownOpenInApplication[] = [
  {
    id: 'vscode',
    label: 'VS Code',
    command: 'code',
    faviconDomain: 'code.visualstudio.com',
    mac: { bundles: ['Visual Studio Code.app'], executable: 'Contents/Resources/app/bin/code' },
    installPaths: {
      win32: [
        '%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\bin\\code.cmd',
        '%ProgramFiles%\\Microsoft VS Code\\bin\\code.cmd'
      ]
    }
  },
  {
    id: 'cursor',
    label: 'Cursor',
    command: 'cursor',
    faviconDomain: 'cursor.com',
    mac: { bundles: ['Cursor.app'], executable: 'Contents/Resources/app/bin/cursor' },
    installPaths: { win32: ['%LOCALAPPDATA%\\Programs\\cursor\\resources\\app\\bin\\cursor.cmd'] }
  },
  {
    id: 'zed',
    label: 'Zed',
    command: 'zed',
    aliases: ['zeditor'],
    faviconDomain: 'zed.dev'
  },
  {
    id: 'android-studio',
    label: 'Android Studio',
    command: 'studio',
    aliases: ['studio64', 'android-studio'],
    faviconDomain: 'developer.android.com',
    mac: {
      bundles: ['Android Studio.app', 'Android Studio Preview.app'],
      executable: 'Contents/MacOS/studio'
    },
    toolboxScript: true,
    installPaths: {
      win32: ['%ProgramFiles%\\Android\\Android Studio\\bin\\studio64.exe'],
      linux: [
        '/opt/android-studio/bin/studio.sh',
        '/usr/local/android-studio/bin/studio.sh',
        '~/android-studio/bin/studio.sh'
      ]
    }
  },
  jetBrainsIde({
    id: 'intellij-idea',
    label: 'IntelliJ IDEA',
    command: 'idea',
    aliases: ['intellij-idea-ultimate', 'intellij-idea-community'],
    bundles: [
      'IntelliJ IDEA.app',
      'IntelliJ IDEA Ultimate.app',
      'IntelliJ IDEA CE.app',
      'IntelliJ IDEA Community Edition.app'
    ],
    windowsFolder: 'IntelliJ IDEA'
  }),
  jetBrainsIde({
    id: 'rider',
    label: 'Rider',
    command: 'rider',
    bundles: ['Rider.app'],
    windowsFolder: 'JetBrains Rider'
  }),
  jetBrainsIde({
    id: 'webstorm',
    label: 'WebStorm',
    command: 'webstorm',
    bundles: ['WebStorm.app'],
    windowsFolder: 'WebStorm'
  }),
  jetBrainsIde({
    id: 'pycharm',
    label: 'PyCharm',
    command: 'pycharm',
    aliases: ['pycharm-professional', 'pycharm-community'],
    bundles: [
      'PyCharm.app',
      'PyCharm CE.app',
      'PyCharm Professional Edition.app',
      'PyCharm Community Edition.app'
    ],
    windowsFolder: 'PyCharm'
  }),
  jetBrainsIde({
    id: 'goland',
    label: 'GoLand',
    command: 'goland',
    bundles: ['GoLand.app'],
    windowsFolder: 'GoLand'
  }),
  jetBrainsIde({
    id: 'clion',
    label: 'CLion',
    command: 'clion',
    bundles: ['CLion.app'],
    windowsFolder: 'CLion'
  }),
  jetBrainsIde({
    id: 'rustrover',
    label: 'RustRover',
    command: 'rustrover',
    bundles: ['RustRover.app'],
    windowsFolder: 'RustRover'
  }),
  {
    id: 'xcode',
    label: 'Xcode',
    command: 'xed',
    faviconDomain: 'developer.apple.com',
    platforms: ['darwin'],
    // Why: /usr/bin/xed exists without Xcode, so only the app bundle proves Xcode is there.
    mac: { bundles: ['Xcode.app', 'Xcode-beta.app'] }
  }
]

/** Lowercased launcher name of a command: no directory, Windows extension, `.sh` or arguments. */
export function getOpenInLauncherIdentity(command: string): string {
  const trimmed = command.trim()
  const quote = trimmed[0]
  const closing = quote === '"' || quote === "'" ? trimmed.indexOf(quote, 1) : -1
  // Why: an unquoted absolute path may hold spaces, so only a bare name splits at whitespace.
  const executable =
    closing > 0
      ? trimmed.slice(1, closing)
      : /[\\/]/.test(trimmed)
        ? trimmed
        : (trimmed.split(/\s+/, 1)[0] ?? '')
  const fileName = executable.split(/[\\/]/).at(-1) ?? ''
  return fileName.replace(/\.(?:cmd|exe|bat|sh)$/i, '').toLowerCase()
}

/** The known editor a configured command launches, by its launcher name. */
export function findKnownOpenInApplication(command: string): KnownOpenInApplication | null {
  const identity = getOpenInLauncherIdentity(command)
  if (!identity) {
    return null
  }
  return (
    KNOWN_OPEN_IN_APPLICATIONS.find(
      (app) => app.command === identity || (app.aliases ?? []).includes(identity)
    ) ?? null
  )
}
