import { constants } from 'node:fs'
import { access, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'
import { resolveCliCommand } from '../codex-cli/command'
import {
  KNOWN_OPEN_IN_APPLICATIONS,
  type KnownOpenInApplication
} from '../../shared/open-in-known-applications'
import type { OpenInApplication } from '../../shared/ui-chrome-types'

export type OpenInDetectionDeps = {
  platform: NodeJS.Platform
  homePath: string
  env: Record<string, string | undefined>
  /** True when `name` resolves to a launcher on PATH or a known CLI install folder. */
  hasLauncher: (name: string) => boolean
  isFile: (pathValue: string) => Promise<boolean>
  isDirectory: (pathValue: string) => Promise<boolean>
  listDirectory: (pathValue: string) => Promise<string[]>
}

type PathApi = typeof posix

// Why numeric: `IDEA 2026.10` is newer than `IDEA 2026.9`.
const VERSION_ORDER = new Intl.Collator(undefined, { numeric: true })

function getPathApi(platform: NodeJS.Platform): PathApi {
  return platform === 'win32' ? win32 : posix
}

function getMacApplicationFolders(homePath: string): string[] {
  // Why: Toolbox installs into ~/Applications, older Toolbox releases into a folder of their own.
  return ['/Applications', `${homePath}/Applications`, `${homePath}/Applications/JetBrains Toolbox`]
}

function getToolboxScriptPath(name: string, deps: OpenInDetectionDeps): string | null {
  const pathApi = getPathApi(deps.platform)
  if (deps.platform === 'win32') {
    const localAppData = deps.env.LOCALAPPDATA
    return localAppData
      ? pathApi.join(localAppData, 'JetBrains', 'Toolbox', 'scripts', `${name}.cmd`)
      : null
  }
  const dataFolder =
    deps.platform === 'darwin'
      ? pathApi.join(deps.homePath, 'Library', 'Application Support')
      : pathApi.join(deps.homePath, '.local', 'share')
  return pathApi.join(dataFolder, 'JetBrains', 'Toolbox', 'scripts', name)
}

function expandInstallPathVariables(template: string, deps: OpenInDetectionDeps): string | null {
  let missing = false
  const expanded = template
    .replace(/^~(?=[\\/])/, deps.homePath)
    .replace(/%(LOCALAPPDATA|ProgramFiles)%/g, (_match, name: string) => {
      const value = deps.env[name]
      missing ||= !value
      return value ?? ''
    })
  return missing ? null : expanded
}

/** The first existing file a template names; a segment ending in `*` matches the newest folder. */
async function findInstallPath(
  template: string,
  deps: OpenInDetectionDeps
): Promise<string | null> {
  const expanded = expandInstallPathVariables(template, deps)
  if (!expanded) {
    return null
  }
  const star = expanded.indexOf('*')
  if (star === -1) {
    return (await deps.isFile(expanded)) ? expanded : null
  }
  const pathApi = getPathApi(deps.platform)
  const head = expanded.slice(0, star)
  const separator = head.lastIndexOf(pathApi.sep)
  const parent = head.slice(0, separator)
  const prefix = head.slice(separator + 1).toLowerCase()
  const rest = expanded.slice(star + 1)
  const folders = (await deps.listDirectory(parent))
    .filter((entry) => entry.toLowerCase().startsWith(prefix))
    .sort((left, right) => VERSION_ORDER.compare(right, left))
  for (const folder of folders) {
    const candidate = `${pathApi.join(parent, folder)}${rest}`
    if (await deps.isFile(candidate)) {
      return candidate
    }
  }
  return null
}

async function findMacBundle(
  bundles: readonly string[],
  deps: OpenInDetectionDeps
): Promise<string | null> {
  for (const folder of getMacApplicationFolders(deps.homePath)) {
    for (const bundle of bundles) {
      const candidate = posix.join(folder, bundle)
      if (await deps.isDirectory(candidate)) {
        return candidate
      }
    }
  }
  return null
}

/** The command that opens `app`: its launcher name when that resolves, else a path to it. */
async function detectCommand(
  app: KnownOpenInApplication,
  deps: OpenInDetectionDeps
): Promise<string | null> {
  if (app.platforms && !app.platforms.includes(deps.platform)) {
    return null
  }
  const mac = deps.platform === 'darwin' ? app.mac : undefined
  const bundle = mac ? await findMacBundle(mac.bundles, deps) : null
  if (mac && !mac.executable && !bundle) {
    return null
  }
  const launcher = [app.command, ...(app.aliases ?? [])].find((name) => deps.hasLauncher(name))
  if (launcher) {
    return launcher
  }
  const toolboxScript = app.toolboxScript ? getToolboxScriptPath(app.command, deps) : null
  if (toolboxScript && (await deps.isFile(toolboxScript))) {
    return toolboxScript
  }
  if (bundle && mac?.executable) {
    const executable = posix.join(bundle, mac.executable)
    if (await deps.isFile(executable)) {
      return executable
    }
  }
  const platformPaths =
    deps.platform === 'win32' || deps.platform === 'linux' ? app.installPaths?.[deps.platform] : []
  for (const template of platformPaths ?? []) {
    const found = await findInstallPath(template, deps)
    if (found) {
      return found
    }
  }
  return null
}

async function isRunnableFile(pathValue: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    if (!(await stat(pathValue)).isFile()) {
      return false
    }
    if (platform !== 'win32') {
      await access(pathValue, constants.X_OK)
    }
    return true
  } catch {
    return false
  }
}

function createDefaultDeps(platform: NodeJS.Platform): OpenInDetectionDeps {
  return {
    platform,
    homePath: homedir(),
    env: process.env,
    hasLauncher: (name) => getPathApi(platform).isAbsolute(resolveCliCommand(name, { platform })),
    isFile: (pathValue) => isRunnableFile(pathValue, platform),
    isDirectory: async (pathValue) => {
      try {
        return (await stat(pathValue)).isDirectory()
      } catch {
        return false
      }
    },
    listDirectory: async (pathValue) => {
      try {
        return await readdir(pathValue)
      } catch {
        return []
      }
    }
  }
}

/** Known editors installed on this computer, in catalog order, with the command that opens each. */
export async function detectInstalledOpenInApplications(
  overrides: Partial<OpenInDetectionDeps> = {}
): Promise<OpenInApplication[]> {
  const deps = { ...createDefaultDeps(overrides.platform ?? process.platform), ...overrides }
  const commands = await Promise.all(
    KNOWN_OPEN_IN_APPLICATIONS.map(async (app) => {
      try {
        return await detectCommand(app, deps)
      } catch {
        // Why: one unreadable location must not hide the editors found elsewhere.
        return null
      }
    })
  )
  return KNOWN_OPEN_IN_APPLICATIONS.flatMap((app, index) => {
    const command = commands[index]
    return command ? [{ id: app.id, label: app.label, command }] : []
  })
}
