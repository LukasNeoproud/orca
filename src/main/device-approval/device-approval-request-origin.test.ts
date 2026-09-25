import { describe, expect, it } from 'vitest'
import { isRequesterDescendantOfMobileTerminal } from './device-approval-request-origin'

describe('mobile approval process origin', () => {
  const parents = new Map([
    [300, 200],
    [200, 100],
    [100, 1]
  ])
  const parentPid = async (pid: number) => parents.get(pid) ?? null

  it('accepts only descendants of an eligible terminal process', async () => {
    await expect(isRequesterDescendantOfMobileTerminal(300, [100], parentPid)).resolves.toBe(true)
    await expect(isRequesterDescendantOfMobileTerminal(300, [101], parentPid)).resolves.toBe(false)
    await expect(isRequesterDescendantOfMobileTerminal(300, [], parentPid)).resolves.toBe(false)
  })

  it('fails closed on missing, cyclic, and invalid process ancestry', async () => {
    await expect(isRequesterDescendantOfMobileTerminal(300, [99], async () => null)).resolves.toBe(
      false
    )
    await expect(isRequesterDescendantOfMobileTerminal(300, [99], async () => 300)).resolves.toBe(
      false
    )
    await expect(isRequesterDescendantOfMobileTerminal(0, [100], parentPid)).resolves.toBe(false)
  })
})
