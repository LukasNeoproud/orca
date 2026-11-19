import { describe, expect, it } from 'vitest'
import { readQualityGateChangeFrame } from './quality-gate-change-stream'

describe('quality gate change stream frames', () => {
  it('reads the frames this build knows', () => {
    expect(readQualityGateChangeFrame({ type: 'ready', subscriptionId: 'sub-1' })).toEqual({
      type: 'ready',
      subscriptionId: 'sub-1'
    })
    expect(readQualityGateChangeFrame({ type: 'changed' })).toEqual({ type: 'changed' })
    expect(readQualityGateChangeFrame({ type: 'end' })).toEqual({ type: 'end' })
  })

  it('keeps reading when a newer host adds fields to a frame', () => {
    expect(readQualityGateChangeFrame({ type: 'changed', worktreeId: 'w', reason: 'run' })).toEqual(
      { type: 'changed' }
    )
  })

  it('ignores a frame type a newer host may add and anything that is not a frame', () => {
    for (const value of [{ type: 'progress' }, { type: 'ready' }, {}, null, 'changed', 7]) {
      expect(readQualityGateChangeFrame(value)).toBeNull()
    }
  })
})
