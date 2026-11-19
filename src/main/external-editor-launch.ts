import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { posix, win32 } from 'node:path'
import { parseWslUncPath } from '../shared/wsl-paths'
import { isVsCodeLauncherExecutable } from '../shared/vscode-remote-ssh-launcher'
import { resolveCliCommand } from './codex-cli/command'
import {
  getLauncherBaseName,
  hasMatchingOuterQuotes,
  stripMatchingQuotes
} from './editor-launcher-name'
import {
  buildExternalEditorProjectRootArgs,
  buildExternalEditorTargetArgs,
  type ExternalEditorFileLocation
} from './external-editor-file-location'
import {
  isJetBrainsConsoleShim,
  resolveColocatedJetBrainsGuiExecutable
} from './jetbrains-windows-gui-launchers'
import { getCmdExePath, getSpawnArgsForWindows } from './win32-utils'

export const EXTERNAL_EDITOR_CLI_COMMAND = 'code'
const WINDOWS_CONSOLE_EDITORS = new Set(['nvim', 'vim'])

export type ExternalEditorExecutableLaunchSpec = {
  kind: 'executable'
  hideWindowsConsole: boolean
  /**
   * Set only for Windows batch shims that would otherwise leave a Command
   * Prompt behind; routes the spawn through `start` with an empty title and
   * `/B`. Left unset elsewhere because `start` re-parses quoted argv.
   */
  detachedGui?: boolean
  spawnCmd: string
  spawnArgs: string[]
}

export type ExternalEditorShellLaunchSpec = {
  kind: 'shell'
  hideWindowsConsole: boolean
  spawnCmd: string
  spawnArgs: string[]
}

export type ExternalEditorLaunchSpec =
  | ExternalEditorExecutableLaunchSpec
  | ExternalEditorShellLaunchSpec

function escapePosixPathForShell(pathValue: string): string {
  if (/^[a-zA-Z0-9_./@:-]+$/.test(pathValue)) {
    return pathValue
  }
  return `'${pathValue.replace(/'/g, "'\\''")}'`
}

function escapeWindowsPathForShell(pathValue: string): string {
  return /^[a-zA-Z0-9_./@:\\-]+$/.test(pathValue) ? pathValue : `"${pathValue}"`
}

function escapePathForShell(pathValue: string, platform: NodeJS.Platform): string {
  return platform === 'win32'
    ? escapeWindowsPathForShell(pathValue)
    : escapePosixPathForShell(pathValue)
}

function isWindowsExecutablePath(command: string): boolean {
  return win32.isAbsolute(command) && /\.(?:cmd|exe|bat|com)$/i.test(command)
}

function isDirectExecutablePath(
  command: string,
  platform: NodeJS.Platform,
  fileExists: (path: string) => boolean
): boolean {
  const unquoted = stripMatchingQuotes(command)
  if (!/[\\/]/.test(unquoted)) {
    return false
  }
  const isAbsolutePath =
    platform === 'win32' ? win32.isAbsolute(unquoted) : posix.isAbsolute(unquoted)
  if (!isAbsolutePath) {
    return false
  }
  if (!/\s/.test(unquoted) || hasMatchingOuterQuotes(command)) {
    return true
  }
  // Why: unquoted POSIX paths can contain spaces, but so can shell commands
  // with arguments. Only an existing path is safe to treat as one executable.
  return platform === 'win32' ? isWindowsExecutablePath(unquoted) : fileExists(unquoted)
}

function shouldShowWindowsConsole(
  command: string,
  platform: NodeJS.Platform,
  options: { shellCommand?: boolean } = {}
): boolean {
  return platform === 'win32' && WINDOWS_CONSOLE_EDITORS.has(getLauncherBaseName(command, options))
}

function buildExecutableArgs(
  editorCommand: string,
  pathValue: string,
  platform: NodeJS.Platform,
  location: ExternalEditorFileLocation | undefined,
  projectRoot: string | undefined
): string[] {
  const isCursor = getLauncherBaseName(editorCommand) === 'cursor'
  const target = resolveWslRemoteTarget(editorCommand, pathValue, platform, isCursor)
  const targetArgs = [
    ...target.remoteArgs,
    // Why: a WSL remote launch with a folder is unverified, so it keeps the bare file.
    ...(target.remoteArgs.length === 0
      ? buildExternalEditorProjectRootArgs(editorCommand, projectRoot, location)
      : []),
    ...buildExternalEditorTargetArgs(editorCommand, target.path, platform, location)
  ]
  // Why: Cursor can route bare folder launches through the last active
  // workbench. A new window keeps "Open in Cursor" scoped to this worktree;
  // a jump to a line belongs in the window that already has the file.
  return isCursor && !location ? ['--new-window', ...targetArgs] : targetArgs
}

function resolveWslRemoteTarget(
  editorCommand: string,
  pathValue: string,
  platform: NodeJS.Platform,
  isCursor: boolean
): { remoteArgs: string[]; path: string } {
  if (platform !== 'win32' || !(isCursor || isVsCodeLauncherExecutable(editorCommand))) {
    return { remoteArgs: [], path: pathValue }
  }
  const wslPath = parseWslUncPath(pathValue)
  // Why: both editors otherwise treat a WSL UNC path as a local Windows folder.
  return wslPath
    ? { remoteArgs: ['--remote', `wsl+${wslPath.distro}`], path: wslPath.linuxPath }
    : { remoteArgs: [], path: pathValue }
}

function isCompoundShellCommand(command: string): boolean {
  return /\s/.test(command)
}

function preferJetBrainsGuiExecutable(
  editorCommand: string,
  platform: NodeJS.Platform,
  fileExists: (path: string) => boolean
): string {
  if (platform !== 'win32') {
    return editorCommand
  }
  return resolveColocatedJetBrainsGuiExecutable(editorCommand, fileExists) ?? editorCommand
}

function resolveSimpleEditorCommand(
  command: string,
  platform: NodeJS.Platform,
  fileExists: (path: string) => boolean
): string {
  return preferJetBrainsGuiExecutable(
    resolveCliCommand(command, { platform }),
    platform,
    fileExists
  )
}

function buildExecutableLaunchSpec(
  editorCommand: string,
  pathValue: string,
  platform: NodeJS.Platform,
  location: ExternalEditorFileLocation | undefined,
  projectRoot?: string
): ExternalEditorExecutableLaunchSpec {
  const spec: ExternalEditorExecutableLaunchSpec = {
    kind: 'executable',
    hideWindowsConsole: !shouldShowWindowsConsole(editorCommand, platform),
    spawnCmd: editorCommand,
    spawnArgs: buildExecutableArgs(editorCommand, pathValue, platform, location, projectRoot)
  }
  if (spec.hideWindowsConsole && isJetBrainsConsoleShim(editorCommand, platform)) {
    spec.detachedGui = true
  }
  return spec
}

function buildShellLaunchSpec(
  command: string,
  pathValue: string,
  platform: NodeJS.Platform,
  location: ExternalEditorFileLocation | undefined
): ExternalEditorLaunchSpec {
  // Why: the leading token names the editor, so `code --reuse-window` still gets `--goto`.
  const targetArgs = buildExternalEditorTargetArgs(command, pathValue, platform, location, {
    shellCommand: true
  })
  const shellCommand = [
    command,
    ...targetArgs.map((arg) => escapePathForShell(arg, platform))
  ].join(' ')
  if (platform === 'win32') {
    // Why: no `start` wrap here. `start` re-parses the line — it swallows the
    // first quoted operand as a window title and mangles remote paths with
    // spaces — and on a batch target it leaves a resident nested `cmd /K`.
    // User-authored compound commands run verbatim; users who want a detached
    // launch already write `start` themselves.
    return {
      kind: 'shell',
      hideWindowsConsole: !shouldShowWindowsConsole(command, platform, { shellCommand: true }),
      spawnCmd: getCmdExePath(),
      spawnArgs: ['/d', '/s', '/c', shellCommand]
    }
  }
  return {
    kind: 'shell',
    hideWindowsConsole: true,
    spawnCmd: '/bin/sh',
    spawnArgs: ['-c', shellCommand]
  }
}

type ExternalEditorLaunchOptions = {
  platform?: NodeJS.Platform
  fileExists?: (path: string) => boolean
  /** Set when `pathValue` is a file to open at a line instead of a folder. */
  location?: ExternalEditorFileLocation
  /**
   * Worktree or folder workspace that holds the file; honored only with `location`.
   * Never applied to compound commands, where `--reuse-window` would replace another folder.
   */
  projectRoot?: string
}

export function resolveExternalEditorLaunchSpec(
  command: string | undefined,
  pathValue: string,
  options: ExternalEditorLaunchOptions = {}
): ExternalEditorLaunchSpec {
  const platform = options.platform ?? process.platform
  const fileExists = options.fileExists ?? existsSync
  const { location, projectRoot } = options
  const trimmed = command?.trim() || EXTERNAL_EDITOR_CLI_COMMAND

  if (isDirectExecutablePath(trimmed, platform, fileExists)) {
    // Why: settings often store a full path to idea.cmd / idea.exe; upgrade
    // those the same way as PATH-resolved names when *64.exe is colocated.
    return buildExecutableLaunchSpec(
      preferJetBrainsGuiExecutable(stripMatchingQuotes(trimmed), platform, fileExists),
      pathValue,
      platform,
      location,
      projectRoot
    )
  }

  if (isCompoundShellCommand(trimmed)) {
    return buildShellLaunchSpec(trimmed, pathValue, platform, location)
  }

  return buildExecutableLaunchSpec(
    resolveSimpleEditorCommand(trimmed, platform, fileExists),
    pathValue,
    platform,
    location,
    projectRoot
  )
}

export function resolveVsCodeRemoteSshLaunchSpec(
  command: string | undefined,
  pathValue: string,
  authority: string,
  options: ExternalEditorLaunchOptions = {}
): ExternalEditorLaunchSpec | null {
  const platform = options.platform ?? process.platform
  const fileExists = options.fileExists ?? existsSync
  const trimmed = command?.trim() || EXTERNAL_EDITOR_CLI_COMMAND

  let editorCommand: string
  if (isDirectExecutablePath(trimmed, platform, fileExists)) {
    editorCommand = stripMatchingQuotes(trimmed)
  } else {
    if (isCompoundShellCommand(trimmed)) {
      return null
    }
    editorCommand = resolveCliCommand(trimmed, { platform })
  }

  if (!isVsCodeLauncherExecutable(editorCommand)) {
    return null
  }
  return {
    kind: 'executable',
    hideWindowsConsole: true,
    spawnCmd: editorCommand,
    spawnArgs: [
      '--remote',
      `ssh-remote+${authority}`,
      ...buildExternalEditorTargetArgs(editorCommand, pathValue, platform, options.location)
    ]
  }
}

function resolveExternalEditorSpawn(launchSpec: ExternalEditorLaunchSpec): {
  spawnCmd: string
  spawnArgs: string[]
  windowsHide: boolean
} {
  // Why: only shims flagged during resolution (JetBrains) take the start /B
  // detach; every other launcher keeps the waiting form so its argv survives.
  if (launchSpec.kind === 'executable') {
    const spawned = getSpawnArgsForWindows(launchSpec.spawnCmd, launchSpec.spawnArgs, {
      detachedGui: launchSpec.detachedGui === true
    })
    return { ...spawned, windowsHide: launchSpec.hideWindowsConsole }
  }
  return {
    spawnCmd: launchSpec.spawnCmd,
    spawnArgs: launchSpec.spawnArgs,
    windowsHide: launchSpec.hideWindowsConsole
  }
}

export async function launchExternalEditor(launchSpec: ExternalEditorLaunchSpec): Promise<void> {
  const { spawnCmd, spawnArgs, windowsHide } = resolveExternalEditorSpawn(launchSpec)
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(spawnCmd, spawnArgs, { detached: true, stdio: 'ignore', windowsHide })
    let settled = false
    function cleanup(): void {
      child.off('error', onError)
      child.off('spawn', onSpawn)
    }
    function settle(callback: () => void): void {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      callback()
    }
    function onError(error: Error): void {
      settle(() => rejectPromise(error))
    }
    function onSpawn(): void {
      child.unref()
      settle(resolvePromise)
    }
    child.once('error', onError)
    child.once('spawn', onSpawn)
  })
}
