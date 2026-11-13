export type AndroidAppRunPhase =
  | 'boot'
  | 'build'
  | 'install'
  | 'launch'
  | 'done'
  | 'failed'
  | 'cancelled'

export type AndroidAppRunRequest = {
  runId: string
  /** Workspace whose tab bar gets the build terminal. */
  worktreeId: string
  /** Directory to build: the workspace itself or another git worktree of its repository. */
  worktreePath: string
  /** One build variant for the whole project, e.g. `debug` or `freeDebug`. */
  variant: string
  /** adb serial of a running device, or the name of an AVD to boot. */
  device: string
}

export type AndroidAppRunEvent =
  | { runId: string; kind: 'phase'; phase: AndroidAppRunPhase; detail?: string }
  | { runId: string; kind: 'output'; text: string }
  /** The build runs in this terminal tab, which then holds its output. */
  | { runId: string; kind: 'terminal'; tabId: string }

export type AndroidAppRunResult = {
  phase: 'done' | 'failed' | 'cancelled'
  /** Serial the app was started on; set once the device is up. */
  serial?: string
  applicationId?: string
  error?: string
}

/** ABIs Android devices report, most common first. */
export const ANDROID_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86'] as const
export type AndroidAbi = (typeof ANDROID_ABIS)[number]

export function isAndroidAbi(value: unknown): value is AndroidAbi {
  return ANDROID_ABIS.some((abi) => abi === value)
}

/** A build whose APK leaves the host, e.g. to be installed on the phone that asked for it. */
export type AndroidApkBuildRequest = {
  runId: string
  worktreeId: string
  worktreePath: string
  variant: string
  /** Package native code for this ABI only, so the APK is no larger than its device needs. */
  abi?: AndroidAbi
}

export type AndroidApkBuildResult = {
  phase: 'done' | 'failed' | 'cancelled'
  apkPath?: string
  applicationId?: string
  sizeBytes?: number
  error?: string
}

/** Whether a workspace can be built for a paired phone, as that phone learns it. */
export type AndroidApkBuildProbe = { isAndroidProject: boolean; savedVariant?: string }

/** A build's progress as a paired client polls it. */
export type AndroidApkBuildStatus = {
  phase: 'build' | 'done' | 'failed' | 'cancelled'
  /** Terminal tab of the workspace that shows the Gradle output. */
  terminalTabId?: string
  /** Set once `phase` is `done`; the path is relative to the workspace, for the file RPCs. */
  apk?: { relativePath: string; size: number; applicationId?: string }
  error?: string
}

export type AndroidBuildVariantsResult = { variants: string[] }
