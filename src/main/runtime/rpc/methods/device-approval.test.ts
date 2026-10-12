import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RpcContext } from '../core'
import { approvalFixture } from '../../../../shared/device-approval-test-fixture'
import { deviceApprovalMailbox } from '../../../device-approval/device-approval-mailbox'
import { isRequesterDescendantOfMobileTerminal } from '../../../device-approval/device-approval-request-origin'
import { DEVICE_APPROVAL_METHODS } from './device-approval'

vi.mock('../../../device-approval/device-approval-mailbox', () => ({
  deviceApprovalMailbox: {
    list: vi.fn(() => ({ supported: true, pending: [] })),
    read: vi.fn(),
    respond: vi.fn()
  }
}))
vi.mock('../../../device-approval/device-approval-request-origin', () => ({
  isRequesterDescendantOfMobileTerminal: vi.fn()
}))

afterEach(() => vi.restoreAllMocks())

function mobileContext(roots: number[]): RpcContext {
  return {
    clientKind: 'mobile',
    clientId: 'phone-a',
    connectionId: 'connection-a',
    pairedDeviceId: 'device-a',
    runtime: {
      getMobileApprovalTerminalRootPids: vi.fn(async () => roots)
    }
  } as unknown as RpcContext
}

// Why: handlers are typed per method; these calls exercise authority, not param parsing.
const approvalMethods = DEVICE_APPROVAL_METHODS as unknown as readonly {
  name: string
  handler: (params: unknown, ctx: RpcContext) => Promise<unknown>
}[]

describe('device approval RPC authority', () => {
  it('refuses local agent/runtime calls and unidentified mobile connections', async () => {
    const list = approvalMethods[0]!
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

  it('lists only requests from terminals controlled by the same phone', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    const request = approvalFixture()
    const enrollment = {
      version: 1,
      kind: 'enrollment',
      requestId: 'b'.repeat(32),
      challengeBase64: `${'A'.repeat(43)}=`,
      createdAt: Date.now(),
      expiresAt: Date.now() + 120_000
    }
    vi.mocked(deviceApprovalMailbox.list).mockResolvedValueOnce({
      supported: true,
      pending: [{ payload: JSON.stringify(request) }, { payload: JSON.stringify(enrollment) }]
    })
    vi.mocked(isRequesterDescendantOfMobileTerminal).mockResolvedValueOnce(false)
    const result = await approvalMethods[0]!.handler({}, mobileContext([100]))
    expect(result).toMatchObject({ pending: [{ payload: JSON.stringify(enrollment) }] })
    expect(isRequesterDescendantOfMobileTerminal).toHaveBeenCalledWith(4242, [100])
  })

  it('rechecks origin before publishing a signed response', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    const request = approvalFixture()
    vi.mocked(deviceApprovalMailbox.read).mockResolvedValue(JSON.stringify(request))
    vi.mocked(isRequesterDescendantOfMobileTerminal).mockResolvedValue(false)
    const response = {
      version: 1 as const,
      requestId: request.requestId,
      signatureDerBase64: 'A'.repeat(88)
    }
    const context = mobileContext([100])
    await expect(approvalMethods[1]!.handler(response, context)).rejects.toThrow(
      'terminal controlled by this phone'
    )
    expect(deviceApprovalMailbox.respond).not.toHaveBeenCalled()
    vi.mocked(isRequesterDescendantOfMobileTerminal).mockResolvedValue(true)
    await expect(approvalMethods[1]!.handler(response, context)).resolves.toEqual({
      submitted: true
    })
    expect(deviceApprovalMailbox.respond).toHaveBeenCalledWith(response)
  })
})
