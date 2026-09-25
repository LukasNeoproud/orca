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

  it('accepts bounded generic Keychain scopes while preserving the private distribution scope', () => {
    const original = approvalFixture(100_000)
    const generic = {
      ...original,
      operation: { kind: 'keychain-read' },
      requests: [
        { service: 'com.example.one', account: 'developer' },
        { service: 'com.example.two', account: 'developer' }
      ]
    }
    expect(parseDeviceApprovalPayload(JSON.stringify(generic), 100_000)).toEqual(generic)
    expect(parseDeviceApprovalPayload(JSON.stringify(original), 100_000)).toEqual(original)
    const maximum = {
      ...generic,
      requests: Array.from({ length: 32 }, (_, index) => ({
        service: 'com.example',
        account: String(index)
      }))
    }
    expect(parseDeviceApprovalPayload(JSON.stringify(maximum), 100_000)).toEqual(maximum)
  })

  it('rejects invalid generic Keychain names, repeated pairs and extra operation fields', () => {
    const generic = {
      ...approvalFixture(),
      operation: { kind: 'keychain-read' },
      requests: [{ service: 'com.example', account: 'developer' }]
    }
    const invalid = [
      { ...generic, requests: [] },
      {
        ...generic,
        requests: Array.from({ length: 33 }, (_, index) => ({
          service: 'com.example',
          account: String(index)
        }))
      },
      { ...generic, requests: [generic.requests[0], generic.requests[0]] },
      { ...generic, requests: [{ service: '', account: 'developer' }] },
      { ...generic, requests: [{ service: 'com.example', account: '' }] },
      { ...generic, requests: [{ service: 'é'.repeat(129), account: 'developer' }] },
      { ...generic, requests: [{ service: 'com.example', account: 'a'.repeat(257) }] },
      { ...generic, requests: [{ service: 'com.example', account: 'line\nfeed' }] },
      { ...generic, requests: [{ service: 'com.example', account: 'hidden\u200bmark' }] },
      { ...generic, requests: [{ service: 'com.example', account: 'line\u2028separator' }] },
      {
        ...generic,
        requests: Array.from({ length: 32 }, (_, index) => ({
          service: `s${index}${'é'.repeat(120)}`,
          account: 'é'.repeat(125)
        }))
      },
      { ...generic, operation: { kind: 'keychain-read', mode: 'publish' } }
    ]
    for (const request of invalid) {
      expect(() => parseDeviceApprovalPayload(JSON.stringify(request))).toThrow()
    }
  })
})
