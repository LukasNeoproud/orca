import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createQualityGateFeedbackLoopSwitches } from './quality-gate-feedback-loop-switches'

describe('workspace switches of the quality gate feedback loop', () => {
  let dir: string
  let filePath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orca-gate-loop-switches-'))
    filePath = join(dir, 'nested', 'quality-gate-feedback-loop.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('has every workspace on until it is turned off, and survives a restart', () => {
    const switches = createQualityGateFeedbackLoopSwitches({ filePath })
    expect(switches.isDisabled('repo::/a')).toBe(false)
    switches.setDisabled('repo::/a', true)
    switches.setDisabled('repo::/a', true)
    expect(switches.isDisabled('repo::/a')).toBe(true)
    expect(switches.isDisabled('repo::/b')).toBe(false)

    const afterRestart = createQualityGateFeedbackLoopSwitches({ filePath })
    expect(afterRestart.isDisabled('repo::/a')).toBe(true)
    afterRestart.setDisabled('repo::/a', false)
    expect(switches.isDisabled('repo::/a')).toBe(false)
  })

  it('reads an unreadable file as nothing turned off', () => {
    const switches = createQualityGateFeedbackLoopSwitches({ filePath: join(dir, 'broken.json') })
    writeFileSync(join(dir, 'broken.json'), '{ not json')
    expect(switches.isDisabled('repo::/a')).toBe(false)
    writeFileSync(join(dir, 'broken.json'), JSON.stringify({ disabledWorktreeIds: 'repo::/a' }))
    expect(switches.isDisabled('repo::/a')).toBe(false)
  })
})
