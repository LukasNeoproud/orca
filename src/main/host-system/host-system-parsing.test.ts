import { describe, expect, it } from 'vitest'
import { parseDarwinBattery } from './host-battery'
import { parsePmsetPowerMode, parsePmsetSleepDisabled } from './host-power-mode'
import { parseNettopDeltaOutput, parsePsOutput, selectTopProcesses } from './host-process-list'

describe('parseDarwinBattery', () => {
  it('reads percent and charging state', () => {
    expect(
      parseDarwinBattery(
        "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=25493603)\t50%; discharging; 19:43 remaining present: true"
      )
    ).toEqual({ percent: 50, charging: false })
    expect(
      parseDarwinBattery(
        "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t87%; charging; 0:40 remaining present: true"
      )
    ).toEqual({ percent: 87, charging: true })
  })

  it('returns null for a Mac without a battery', () => {
    expect(parseDarwinBattery("Now drawing from 'AC Power'\n")).toBeNull()
  })
})

const PMSET_G = `System-wide power settings:
 SleepDisabled\t\t1
Currently in use:
 standby              1
 sleep                1 (sleep prevented by powerd)
 powermode            1
 womp                 1
`

describe('pmset -g parsing', () => {
  it('reads the in-use power mode', () => {
    expect(parsePmsetPowerMode(PMSET_G)).toBe('low-power')
    expect(parsePmsetPowerMode(PMSET_G.replace('powermode            1', 'powermode 2'))).toBe(
      'high-power'
    )
  })

  it('reports no mode when the Mac lacks the profile key', () => {
    expect(parsePmsetPowerMode(PMSET_G.replace(/ powermode.*\n/, ''))).toBeNull()
  })

  it('detects disablesleep', () => {
    expect(parsePmsetSleepDisabled(PMSET_G)).toBe(true)
    expect(
      parsePmsetSleepDisabled(PMSET_G.replace('SleepDisabled\t\t1', 'SleepDisabled\t\t0'))
    ).toBe(false)
  })
})

describe('process list parsing', () => {
  it('parses ps rows including executable paths with spaces', () => {
    const rows = parsePsOutput(
      [
        '10518  18.9 432688 claude',
        '39138  12.1 679632 /Applications/Orca.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Helper (Renderer)',
        'garbage'
      ].join('\n')
    )
    expect(rows).toEqual([
      { pid: 10518, cpuPercent: 18.9, memoryBytes: 432688 * 1024, name: 'claude' },
      {
        pid: 39138,
        cpuPercent: 12.1,
        memoryBytes: 679632 * 1024,
        name: 'Electron Helper (Renderer)'
      }
    ])
  })

  it('keeps top CPU processes and adds memory-heavy ones without duplicates', () => {
    const samples = Array.from({ length: 50 }, (_, index) => ({
      pid: index + 2,
      name: `p${index}`,
      cpuPercent: 50 - index,
      memoryBytes: index
    }))
    const top = selectTopProcesses(samples)
    expect(top).toHaveLength(40)
    expect(new Set(top.map((entry) => entry.pid)).size).toBe(40)
    expect(top[0].pid).toBe(2)
    expect(top.at(-1)!.memoryBytes).toBe(40)
  })

  it('reads the delta block of nettop output', () => {
    const output = [
      ',bytes_in,bytes_out,',
      'mDNSResponder.502,112235479,25577035,',
      'Slack Helper.4427,596843,43310,',
      ',bytes_in,bytes_out,',
      'mDNSResponder.502,10,20,',
      'com.apple.WebKi.5700,1000,24,'
    ].join('\n')
    expect(parseNettopDeltaOutput(output)).toEqual(
      new Map([
        [502, 30],
        [5700, 1024]
      ])
    )
  })

  it('rejects nettop output without a delta block', () => {
    expect(parseNettopDeltaOutput(',bytes_in,bytes_out,\nlaunchd.1,0,0,')).toBeNull()
  })
})
