import { describe, expect, it } from 'vitest'
import { parseDeviceApprovalPayload } from './device-approval-contract'
import { approvalFixture } from './device-approval-test-fixture'

describe('device approval display contract', () => {
  it('accepts the exact fixed scope and rejects expired, future or extended requests', () => {
    const request = approvalFixture(100_000)
    expect(parseDeviceApprovalPayload(JSON.stringify(request), 100_000)).toEqual(request)
    expect(() => parseDeviceApprovalPayload(JSON.stringify(request), 220_000)).toThrow()
    expect(() => parseDeviceApprovalPayload(JSON.stringify(request), 90_000)).toThrow()
    expect(() =>
      parseDeviceApprovalPayload(JSON.stringify({ ...request, expiresAt: 500_000 }), 100_000)
    ).toThrow()
  })
  it('rejects substituted credential scopes, unknown fields and other Firebase applications', () => {
    const request = approvalFixture()
    for (const changed of [
      { ...request, execute: 'arbitrary-command' },
      { ...request, requests: request.requests.toReversed() },
      { ...request, operation: { ...request.operation, firebaseAppId: 'another-app' } },
      { ...request, operation: { ...request.operation, groups: [] } },
      { ...request, operation: { ...request.operation, groups: ['testers', 'testers'] } },
      { ...request, operation: { ...request.operation, groups: ['z', 'a'] } },
      { ...request, operation: { ...request.operation, mode: 'build' } }
    ]) {
      expect(() => parseDeviceApprovalPayload(JSON.stringify(changed))).toThrow()
    }
  })
})
