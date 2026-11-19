import { isVsCodeLauncherExecutable } from '../shared/vscode-remote-ssh-launcher'
import { getLauncherBaseName } from './editor-launcher-name'
import { isJetBrainsLauncherName } from './jetbrains-windows-gui-launchers'

/** 1-based position inside the file an external editor is asked to open. */
export type ExternalEditorFileLocation = {
  line: number
  column?: number
}

/** Editors that share one command-line syntax for opening a file at a line. */
type ExternalEditorFamily = 'vscode' | 'jetbrains' | 'xcode' | 'zed' | 'unknown'

// Why: VS Code forks keep its `--goto file:line:column` flag.
const VSCODE_FAMILY_LAUNCHERS = new Set([
  'code',
  'code-insiders',
  'code - insiders',
  'code-oss',
  'codium',
  'vscodium',
  'cursor',
  'windsurf',
  'kiro',
  'trae',
  'antigravity'
])

// Launcher names the Windows console-to-GUI map does not carry.
const JETBRAINS_EXTRA_LAUNCHERS = new Set([
  'android-studio',
  'aqua',
  'dataspell',
  'intellij-idea-community',
  'intellij-idea-ultimate',
  'pycharm-community',
  'pycharm-professional'
])

const ZED_LAUNCHERS = new Set(['zed', 'zed-preview', 'zeditor'])

function toPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

/** A location only when `line` is a usable 1-based number; a bad column is dropped. */
export function normalizeExternalEditorFileLocation(
  line: unknown,
  column: unknown
): ExternalEditorFileLocation | undefined {
  const validLine = toPositiveInteger(line)
  if (validLine === null) {
    return undefined
  }
  const validColumn = toPositiveInteger(column)
  return validColumn === null ? { line: validLine } : { line: validLine, column: validColumn }
}

function detectExternalEditorFamily(
  command: string,
  platform: NodeJS.Platform,
  options: { shellCommand?: boolean } = {}
): ExternalEditorFamily {
  // Why: Linux JetBrains installs launch through `idea.sh` / `studio.sh`.
  const name = getLauncherBaseName(command, options).replace(/\.sh$/, '')
  if (VSCODE_FAMILY_LAUNCHERS.has(name)) {
    return 'vscode'
  }
  if (isJetBrainsLauncherName(name) || JETBRAINS_EXTRA_LAUNCHERS.has(name)) {
    return 'jetbrains'
  }
  // Why: `xed` is Xcode's opener only on macOS; on Linux the name is a plain text editor.
  if (name === 'xed' && platform === 'darwin') {
    return 'xcode'
  }
  if (ZED_LAUNCHERS.has(name)) {
    return 'zed'
  }
  return 'unknown'
}

function formatPathWithLocation(pathValue: string, location: ExternalEditorFileLocation): string {
  const column = location.column === undefined ? '' : `:${location.column}`
  return `${pathValue}:${location.line}${column}`
}

/** Target argv for `command`: the bare path, or the file at `location` in that editor's syntax. */
export function buildExternalEditorTargetArgs(
  command: string,
  pathValue: string,
  platform: NodeJS.Platform,
  location: ExternalEditorFileLocation | undefined,
  options: { shellCommand?: boolean } = {}
): string[] {
  return location
    ? buildExternalEditorFileLocationArgs(
        detectExternalEditorFamily(command, platform, options),
        pathValue,
        location
      )
    : [pathValue]
}

/**
 * Folder argv that puts a file opened at a line into that folder's window instead of the
 * last active one. Empty for editors where this is unverified.
 */
export function buildExternalEditorProjectRootArgs(
  command: string,
  projectRoot: string | undefined,
  location: ExternalEditorFileLocation | undefined
): string[] {
  // Why: only VS Code is verified; a JetBrains IDE may ask where to open a folder it does not have open.
  return projectRoot && location && isVsCodeLauncherExecutable(command) ? [projectRoot] : []
}

/** argv that opens `pathValue` at `location`; an unknown family gets the bare file. */
function buildExternalEditorFileLocationArgs(
  family: ExternalEditorFamily,
  pathValue: string,
  location: ExternalEditorFileLocation
): string[] {
  switch (family) {
    case 'vscode':
      return ['--goto', formatPathWithLocation(pathValue, location)]
    case 'jetbrains':
      // Why: the IntelliJ platform reads `--line` as 1-based and `--column` as 0-based.
      return [
        '--line',
        String(location.line),
        ...(location.column === undefined ? [] : ['--column', String(location.column - 1)]),
        pathValue
      ]
    case 'xcode':
      return ['-l', String(location.line), pathValue]
    case 'zed':
      return [formatPathWithLocation(pathValue, location)]
    case 'unknown':
      return [pathValue]
  }
}
