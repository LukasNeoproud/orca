import { describe, expect, it } from 'vitest'
import { mobileEmulatorCodecPreferences } from './mobile-emulator-codec-preferences'

describe('video codec negotiation', () => {
  const all = { h264: true, hevc: true, av1: true }
  it('prioritizes latency for responsive and compression for data saving', () => {
    expect(mobileEmulatorCodecPreferences(all, 'auto', 'responsive')).toEqual([
      'h264',
      'hevc',
      'av1',
      'jpeg'
    ])
    expect(mobileEmulatorCodecPreferences(all, 'auto', 'data-saver')).toEqual([
      'av1',
      'hevc',
      'h264',
      'jpeg'
    ])
  })
  it('respects explicit preference without claiming unsupported or failed codecs', () => {
    expect(mobileEmulatorCodecPreferences(all, 'hevc', 'responsive')).toEqual([
      'hevc',
      'h264',
      'av1',
      'jpeg'
    ])
    expect(
      mobileEmulatorCodecPreferences({ ...all, av1: false }, 'av1', 'quality', ['hevc'])
    ).toEqual(['h264', 'jpeg'])
    expect(mobileEmulatorCodecPreferences(all, 'jpeg', 'quality')).toEqual(['jpeg'])
  })
})
