import { describe, expect, it, vi } from 'vitest'

vi.mock('../cli/cli-privileged-processes', () => ({ runMacPrivilegedCommand: vi.fn() }))

import { buildPowerModeSudoersRule, POWER_MODE_SUDOERS_PATH } from './power-mode-sudoers-rule'
import { buildPowerModeSudoersInstallScript } from './power-mode-sudoers-setup'

describe('power mode sudoers rule', () => {
  it('pins exact pmset argv for the user', () => {
    expect(buildPowerModeSudoersRule('lukas')).toBe(
      '# orca-pmset v1: power mode switching and thermal-emergency sleep for Orca.\n' +
        'lukas ALL=(root) NOPASSWD: /usr/bin/pmset -a powermode 0, /usr/bin/pmset -a powermode 1, /usr/bin/pmset -a disablesleep 0\n'
    )
  })

  it('rejects user names that could inject sudoers syntax', () => {
    for (const name of ['', 'a b', 'root,ALL', 'x\nALL ALL=(ALL) ALL', "o'neil"]) {
      expect(() => buildPowerModeSudoersRule(name)).toThrow()
    }
  })

  it('validates before installing and rolls back a config that sudo rejects', () => {
    const script = buildPowerModeSudoersInstallScript(buildPowerModeSudoersRule('lukas'))
    const validate = script.indexOf('visudo -cf "$tmp"')
    const install = script.indexOf(
      `install -m 0440 -o root -g wheel "$tmp" ${POWER_MODE_SUDOERS_PATH}`
    )
    expect(validate).toBeGreaterThan(-1)
    expect(install).toBeGreaterThan(validate)
    expect(script).toMatch(/^set -e/)
    expect(script).toContain(
      `visudo -c >/dev/null || { /bin/rm -f ${POWER_MODE_SUDOERS_PATH}; exit 1; }`
    )
  })
})
