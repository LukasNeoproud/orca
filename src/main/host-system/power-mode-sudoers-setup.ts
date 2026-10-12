import os from 'node:os'
import { runProcess } from '@orca/process-host'
import { runMacPrivilegedCommand } from '../cli/cli-privileged-processes'
import type {
  PowerModeSetupActionResult,
  PowerModeSetupStatus
} from '../../shared/host-system-types'
import { parsePmsetPowerMode, readPmsetSettings } from './host-power-mode'
import {
  buildPowerModeSudoersRule,
  isPowerModeSudoersRuleInstalled,
  PMSET_PATH,
  POWER_MODE_PMSET_VALUES,
  POWER_MODE_SUDOERS_PATH,
  sudoNonInteractiveArgs
} from './power-mode-sudoers-rule'

const VERIFY_TIMEOUT_MS = 3_000

/**
 * Builds the root shell script that installs the rule.
 *
 * A malformed sudoers.d file disables sudo entirely, so the rule is validated
 * before it lands and the whole config is re-checked after, rolling back on failure.
 */
export function buildPowerModeSudoersInstallScript(rule: string): string {
  const lines = rule
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => `'${line.replaceAll("'", `'\\''`)}'`)
    .join(' ')
  return [
    'set -e',
    'tmp=$(/usr/bin/mktemp /private/tmp/orca-pmset.XXXXXX)',
    'trap \'/bin/rm -f "$tmp"\' EXIT',
    `/usr/bin/printf '%s\\n' ${lines} > "$tmp"`,
    '/usr/sbin/visudo -cf "$tmp" >/dev/null',
    `/usr/bin/install -m 0440 -o root -g wheel "$tmp" ${POWER_MODE_SUDOERS_PATH}`,
    `/usr/sbin/visudo -c >/dev/null || { /bin/rm -f ${POWER_MODE_SUDOERS_PATH}; exit 1; }`
  ].join('\n')
}

export async function getPowerModeSetupStatus(): Promise<PowerModeSetupStatus> {
  if (process.platform !== 'darwin') {
    return { supported: false, installed: false, verified: null }
  }
  const installed = await isPowerModeSudoersRuleInstalled()
  return { supported: true, installed, verified: installed ? await verifyRule() : null }
}

// Re-applies the current mode through the rule: a no-op write that proves it end to end.
async function verifyRule(): Promise<boolean | null> {
  const settings = await readPmsetSettings().catch(() => null)
  const current = settings ? parsePmsetPowerMode(settings) : null
  if (current !== 'automatic' && current !== 'low-power') {
    return null
  }
  const result = await runProcess({
    ...sudoNonInteractiveArgs([PMSET_PATH, '-a', 'powermode', POWER_MODE_PMSET_VALUES[current]]),
    timeoutMs: VERIFY_TIMEOUT_MS
  }).catch(() => null)
  return result?.code === 0
}

function toFailure(error: unknown): PowerModeSetupActionResult {
  const message = error instanceof Error ? error.message : String(error)
  // osascript reports a dismissed authorization dialog as error -128.
  if (/-128|User cancel+ed/i.test(message)) {
    return { ok: false, reason: 'cancelled' }
  }
  return { ok: false, reason: 'failed', message }
}

export async function installPowerModeSetup(): Promise<PowerModeSetupActionResult> {
  if (process.platform !== 'darwin') {
    return { ok: false, reason: 'unsupported' }
  }
  try {
    const rule = buildPowerModeSudoersRule(os.userInfo().username)
    await runMacPrivilegedCommand(buildPowerModeSudoersInstallScript(rule))
    return { ok: true, status: await getPowerModeSetupStatus() }
  } catch (error) {
    return toFailure(error)
  }
}

export async function removePowerModeSetup(): Promise<PowerModeSetupActionResult> {
  if (process.platform !== 'darwin') {
    return { ok: false, reason: 'unsupported' }
  }
  try {
    await runMacPrivilegedCommand(`/bin/rm -f ${POWER_MODE_SUDOERS_PATH}`)
    return { ok: true, status: await getPowerModeSetupStatus() }
  } catch (error) {
    return toFailure(error)
  }
}
