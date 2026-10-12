import { runProcess } from '@orca/process-host'
import {
  HOST_SYSTEM_ERROR_CODES,
  type HostPowerMode,
  type HostPowerModeState,
  type HostSwitchablePowerMode
} from '../../shared/host-system-types'
import {
  isPowerModeSudoersRuleInstalled,
  PMSET_PATH,
  POWER_MODE_PMSET_VALUES,
  sudoNonInteractiveArgs
} from './power-mode-sudoers-rule'

const PROBE_TIMEOUT_MS = 2_000

export class PowerModeSetupRequiredError extends Error {
  readonly code = HOST_SYSTEM_ERROR_CODES.powerModeSetupRequired
  constructor() {
    super('Allow power mode switching in Orca Settings → Mobile on this Mac first.')
  }
}

export async function readPmsetSettings(): Promise<string | null> {
  const result = await runProcess({
    program: PMSET_PATH,
    args: ['-g'],
    timeoutMs: PROBE_TIMEOUT_MS
  })
  return result.code === 0 ? result.stdout : null
}

export function parsePmsetPowerMode(stdout: string): HostPowerMode | null {
  // `pmset -g` lists the active power source's profile under "Currently in use".
  const inUse = stdout.split(/Currently in use:/)[1] ?? ''
  const match = /^\s*powermode\s+(\d)\b/m.exec(inUse)
  switch (match?.[1]) {
    case '0':
      return 'automatic'
    case '1':
      return 'low-power'
    case '2':
      return 'high-power'
    case undefined:
    default:
      return null
  }
}

export function parsePmsetSleepDisabled(stdout: string): boolean {
  return /^\s*SleepDisabled\s+1\b/m.test(stdout)
}

export async function readHostPowerMode(
  platform: NodeJS.Platform
): Promise<HostPowerModeState | null> {
  if (platform !== 'darwin') {
    return null
  }
  const [settings, switchable] = await Promise.all([
    readPmsetSettings().catch(() => null),
    isPowerModeSudoersRuleInstalled()
  ])
  const current = settings ? parsePmsetPowerMode(settings) : null
  // Why: Macs without the low power profile omit the key; offering a switch there would only fail.
  return current === null ? null : { current, switchable }
}

export async function setHostPowerMode(
  platform: NodeJS.Platform,
  mode: HostSwitchablePowerMode
): Promise<HostPowerModeState> {
  if (platform !== 'darwin') {
    throw new Error('Power mode switching is only supported on macOS hosts')
  }
  const result = await runProcess({
    ...sudoNonInteractiveArgs([PMSET_PATH, '-a', 'powermode', POWER_MODE_PMSET_VALUES[mode]]),
    timeoutMs: PROBE_TIMEOUT_MS
  })
  if (result.code !== 0) {
    throw new PowerModeSetupRequiredError()
  }
  const state = await readHostPowerMode(platform)
  if (!state) {
    throw new Error('Power mode is unavailable on this Mac')
  }
  return state
}
