import { access } from 'node:fs/promises'

// Why sudoers: `pmset` refuses every write without root, and Orca has no signed
// privileged helper. The rule pins exact argv, so it grants nothing beyond these writes.
export const POWER_MODE_SUDOERS_PATH = '/etc/sudoers.d/orca-pmset'
export const PMSET_PATH = '/usr/bin/pmset'
const SUDO_PATH = '/usr/bin/sudo'
const RULE_VERSION = 1

export const POWER_MODE_PMSET_VALUES = { automatic: '0', 'low-power': '1' } as const

// Argv permitted by the rule; callers must run exactly these through `sudo -n`.
export const POWER_MODE_SUDO_COMMANDS = [
  [PMSET_PATH, '-a', 'powermode', POWER_MODE_PMSET_VALUES.automatic],
  [PMSET_PATH, '-a', 'powermode', POWER_MODE_PMSET_VALUES['low-power']],
  [PMSET_PATH, '-a', 'disablesleep', '0']
] as const

const SUDOERS_USER_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/

export function buildPowerModeSudoersRule(username: string): string {
  if (!SUDOERS_USER_PATTERN.test(username)) {
    throw new Error('Unsupported user name for the power mode rule')
  }
  const commands = POWER_MODE_SUDO_COMMANDS.map((argv) => argv.join(' ')).join(', ')
  return [
    `# orca-pmset v${RULE_VERSION}: power mode switching and thermal-emergency sleep for Orca.`,
    `${username} ALL=(root) NOPASSWD: ${commands}`,
    ''
  ].join('\n')
}

export function sudoNonInteractiveArgs(argv: readonly string[]): {
  program: string
  args: string[]
} {
  return { program: SUDO_PATH, args: ['-n', ...argv] }
}

export async function isPowerModeSudoersRuleInstalled(): Promise<boolean> {
  try {
    // The file is root-only readable, but its directory entry is visible to the user.
    await access(POWER_MODE_SUDOERS_PATH)
    return true
  } catch {
    return false
  }
}
