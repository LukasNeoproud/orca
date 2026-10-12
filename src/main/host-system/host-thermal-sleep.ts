import { runProcess } from '@orca/process-host'
import { parsePmsetSleepDisabled, readPmsetSettings } from './host-power-mode'
import { PMSET_PATH, sudoNonInteractiveArgs } from './power-mode-sudoers-rule'

const STEP_TIMEOUT_MS = 5_000

// Guarded on `is running` so the script never launches Amphetamine just to stop it.
const END_AMPHETAMINE_SESSION_SCRIPT = [
  'if application "Amphetamine" is running then',
  '  tell application "Amphetamine" to end session',
  'end if'
].join('\n')

export type ThermalSleepOutcome =
  | { requested: true }
  | { requested: false; reason: 'sleep-disabled' | 'sleep-command-failed' }

/**
 * Puts a macOS host to sleep on a critical thermal state.
 *
 * Keep-awake tools fall in two classes: power assertions (caffeinate, Orca's own
 * agent-awake blocker) never block an explicit sleep, but `pmset disablesleep 1`
 * (Amphetamine's closed-display mode) blocks it entirely and must be undone first.
 */
export async function requestThermalEmergencySleep(): Promise<ThermalSleepOutcome> {
  await runProcess({
    program: '/usr/bin/osascript',
    args: ['-e', END_AMPHETAMINE_SESSION_SCRIPT],
    timeoutMs: STEP_TIMEOUT_MS
  }).catch(() => null)

  const settings = await readPmsetSettings().catch(() => null)
  if (settings && parsePmsetSleepDisabled(settings)) {
    await runProcess({
      ...sudoNonInteractiveArgs([PMSET_PATH, '-a', 'disablesleep', '0']),
      timeoutMs: STEP_TIMEOUT_MS
    }).catch(() => null)
    const after = await readPmsetSettings().catch(() => null)
    if (!after || parsePmsetSleepDisabled(after)) {
      return { requested: false, reason: 'sleep-disabled' }
    }
  }

  const sleep = await runProcess({
    program: PMSET_PATH,
    args: ['sleepnow'],
    timeoutMs: STEP_TIMEOUT_MS
  }).catch(() => null)
  return sleep?.code === 0
    ? { requested: true }
    : { requested: false, reason: 'sleep-command-failed' }
}
