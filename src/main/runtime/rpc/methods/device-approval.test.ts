import { describe, expect, it, vi } from 'vitest'
import type { RpcContext } from '../core'
import { DEVICE_APPROVAL_METHODS } from './device-approval'

vi.mock('../../../device-approval/device-approval-mailbox', () => ({
  deviceApprovalMailbox: { list: vi.fn(() => ({ supported: true, pending: [] })) }
}))
describe('device approval RPC authority', () => {
  it('refuses local agent/runtime calls and unidentified mobile connections', async () => {
    const list = DEVICE_APPROVAL_METHODS[0]!
    for (const context of [
      {},
      { clientKind: 'runtime', connectionId: 'a', pairedDeviceId: 'p' },
      { clientKind: 'mobile', connectionId: 'a' }
    ]) {
      await expect(list.handler({}, context as RpcContext)).rejects.toThrow('paired mobile')
    }
  })
  it('does not expose enrollment, secret retrieval or command execution authority', () => {
    expect(DEVICE_APPROVAL_METHODS.map((method) => method.name)).toEqual([
      'deviceApproval.list',
      'deviceApproval.respond',
      'deviceApproval.enroll'
    ])
  })
})
