import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProcessSpec } from '@orca/process-host/process-spec'
import type { AndroidAbi } from '../../shared/android-app-run-types'

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'build', 'gradle', 'buildSrc'])
const MODULE_SEARCH_DEPTH = 2
const APK_METADATA_SEARCH_DEPTH = 6
const MAX_DIRECTORIES_SCANNED = 2000

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  )
}

async function childDirectories(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() && !entry.name.startsWith('.') && !SKIPPED_DIRECTORIES.has(entry.name)
    )
    .map((entry) => join(directory, entry.name))
}

/** A Gradle wrapper project with at least one module carrying an Android manifest. */
export async function isGradleAndroidProject(root: string): Promise<boolean> {
  const hasSettings =
    (await exists(join(root, 'settings.gradle.kts'))) ||
    (await exists(join(root, 'settings.gradle')))
  if (!hasSettings || !(await exists(join(root, 'gradlew')))) {
    return false
  }
  let level = [root]
  for (let depth = 0; depth <= MODULE_SEARCH_DEPTH && level.length > 0; depth += 1) {
    const next: string[] = []
    for (const directory of level) {
      if (await exists(join(directory, 'src', 'main', 'AndroidManifest.xml'))) {
        return true
      }
      next.push(...(await childDirectories(directory)))
    }
    level = next.slice(0, MAX_DIRECTORIES_SCANNED)
  }
  return false
}

/** Runs the project's own wrapper, so the Gradle version is the one the project pins. */
export function gradleWrapperSpec(
  root: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform
): Pick<ProcessSpec, 'program' | 'args' | 'cwd'> {
  if (platform === 'win32') {
    return { program: join(root, 'gradlew.bat'), args, cwd: root }
  }
  // Why through sh: a checkout can lose the wrapper's executable bit.
  return { program: '/bin/sh', args: [join(root, 'gradlew'), ...args], cwd: root }
}

export const GRADLE_LIST_TASKS_ARGS = ['tasks', '--all', '--console=plain', '-q'] as const

const TEST_VARIANT_SUFFIX = /(AndroidTest|UnitTest|ScreenshotTest|TestFixtures)$/

/**
 * Build variants of the application modules, read from `gradlew tasks --all`.
 *
 * Only modules with an install task are applications; their `assemble<Variant>` tasks name the
 * variants. Task names stay stable across Android Gradle Plugin versions, unlike its variant API.
 */
export function parseAndroidBuildVariants(tasksOutput: string): string[] {
  const applicationModules = new Set<string>()
  const assembleTasks: { module: string; name: string; description: string }[] = []
  for (const line of tasksOutput.split(/\r?\n/)) {
    const match = /^((?:[\w.-]+:)*)(install|assemble)([A-Z]\w*)(?: - (.*))?$/.exec(line.trim())
    if (!match) {
      continue
    }
    const [, module = '', kind, name = '', description = ''] = match
    if (kind === 'install') {
      applicationModules.add(module)
    } else {
      assembleTasks.push({ module, name, description })
    }
  }
  const variants = new Set<string>()
  for (const task of assembleTasks) {
    if (!applicationModules.has(task.module) || TEST_VARIANT_SUFFIX.test(task.name)) {
      continue
    }
    // `assembleFree` aggregates a flavor; only per-variant tasks say which variant they build.
    const named = /\bvariant (\w+)/.exec(task.description)?.[1]
    if (named && !TEST_VARIANT_SUFFIX.test(named)) {
      variants.add(named)
    }
  }
  return [...variants].sort((a, b) => a.localeCompare(b))
}

export function assembleTaskName(variant: string): string {
  if (!/^[A-Za-z]\w*$/.test(variant)) {
    throw new Error(`Invalid build variant: ${variant}`)
  }
  return `assemble${variant[0]!.toUpperCase()}${variant.slice(1)}`
}

/**
 * The property Android Studio injects when it deploys to one device: the Android Gradle Plugin
 * then packages native libraries for that ABI only. Projects need no configuration for it.
 */
export function singleAbiGradleArgs(abi: AndroidAbi | undefined): string[] {
  return abi ? [`-Pandroid.injected.build.abi=${abi}`] : []
}

export type BuiltAndroidApk = { apkPath: string; applicationId: string }

type ApkOutputMetadata = {
  applicationId?: unknown
  variantName?: unknown
  elements?: { outputFile?: unknown; filters?: unknown }[]
}

function hasAbiFilter(filters: unknown, abi: string): boolean {
  return (
    Array.isArray(filters) &&
    filters.some(
      (filter: unknown) =>
        typeof filter === 'object' &&
        filter !== null &&
        'filterType' in filter &&
        filter.filterType === 'ABI' &&
        'value' in filter &&
        filter.value === abi
    )
  )
}

/**
 * Picks the APK of a variant split by ABI or density: the split for `abi` when one was asked
 * for and exists, else the universal APK.
 */
export function apkFromOutputMetadata(
  metadataDirectory: string,
  rawMetadata: string,
  variant: string,
  abi?: AndroidAbi
): BuiltAndroidApk | null {
  let metadata: ApkOutputMetadata
  try {
    metadata = JSON.parse(rawMetadata)
  } catch {
    return null
  }
  if (metadata.variantName !== variant || typeof metadata.applicationId !== 'string') {
    return null
  }
  const elements = Array.isArray(metadata.elements) ? metadata.elements : []
  const element =
    (abi ? elements.find((item) => hasAbiFilter(item.filters, abi)) : undefined) ??
    elements.find((item) => !Array.isArray(item.filters) || item.filters.length === 0) ??
    elements[0]
  return typeof element?.outputFile === 'string'
    ? {
        apkPath: join(metadataDirectory, element.outputFile),
        applicationId: metadata.applicationId
      }
    : null
}

/** Finds what `assemble<Variant>` produced, wherever the modules keep their build directories. */
export async function findBuiltApks(
  root: string,
  variant: string,
  abi?: AndroidAbi
): Promise<BuiltAndroidApk[]> {
  const found: BuiltAndroidApk[] = []
  let scanned = 0
  const visit = async (
    directory: string,
    depth: number,
    insideApkOutputs: boolean
  ): Promise<void> => {
    if (depth > APK_METADATA_SEARCH_DEPTH + 4 || (scanned += 1) > MAX_DIRECTORIES_SCANNED) {
      return
    }
    if (insideApkOutputs) {
      const raw = await readFile(join(directory, 'output-metadata.json'), 'utf8').catch(() => null)
      const apk = raw ? apkFromOutputMetadata(directory, raw, variant, abi) : null
      if (apk) {
        found.push(apk)
        return
      }
    }
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue
      }
      const child = join(directory, entry.name)
      if (insideApkOutputs) {
        await visit(child, depth + 1, true)
      } else if (entry.name === 'build') {
        // Skip everything in a build directory except its APK outputs.
        await visit(join(child, 'outputs', 'apk'), depth + 3, true)
      } else if (depth < APK_METADATA_SEARCH_DEPTH) {
        await visit(child, depth + 1, false)
      }
    }
  }
  await visit(root, 0, false)
  return found
}
