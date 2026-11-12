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
  worktreePath: string
  /** One build variant for the whole project, e.g. `debug` or `freeDebug`. */
  variant: string
  /** adb serial of a running device, or the name of an AVD to boot. */
  device: string
}

export type AndroidAppRunEvent =
  | { runId: string; kind: 'phase'; phase: AndroidAppRunPhase; detail?: string }
  | { runId: string; kind: 'output'; text: string }

export type AndroidAppRunResult = {
  phase: 'done' | 'failed' | 'cancelled'
  /** Serial the app was started on; set once the device is up. */
  serial?: string
  applicationId?: string
  error?: string
}

export type AndroidBuildVariantsResult = { variants: string[] }
