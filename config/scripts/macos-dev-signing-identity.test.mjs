import { describe, expect, it } from 'vitest'
import {
  DEV_SIGNING_IDENTITY,
  findSigningIdentityHash,
  resolveDevSigningIdentity
} from './macos-dev-signing-identity.mjs'

const identities = () =>
  [
    '  1) 270E9AE7FB377AC34493E34BD20CF323EC13D5BA "Apple Development: Team (AAA)"',
    '  2) 852F55767FC7CF1E9C5F73E0B48F2246829CF218 "Apple Development: Team (AAA)"',
    '  3) FDAF1AC3024D40BC17B1C98BACA34B70B8BF81A5 "Orca Dev Local Signing"',
    '     3 valid identities found'
  ].join('\n')

describe('macOS dev signing identity', () => {
  it('defaults to the self-signed identity unless one is configured', () => {
    expect(resolveDevSigningIdentity({})).toBe(DEV_SIGNING_IDENTITY)
    expect(resolveDevSigningIdentity({ ORCA_DEV_SIGNING_IDENTITY: ' ' })).toBe(DEV_SIGNING_IDENTITY)
    expect(resolveDevSigningIdentity({ ORCA_DEV_SIGNING_IDENTITY: ' abc ' })).toBe('abc')
  })

  it('finds an identity by name or case-insensitive SHA-1', () => {
    expect(findSigningIdentityHash(DEV_SIGNING_IDENTITY, identities)).toBe(
      'FDAF1AC3024D40BC17B1C98BACA34B70B8BF81A5'
    )
    expect(findSigningIdentityHash('852f55767fc7cf1e9c5f73e0b48f2246829cf218', identities)).toBe(
      '852F55767FC7CF1E9C5F73E0B48F2246829CF218'
    )
    expect(findSigningIdentityHash('Missing', identities)).toBeNull()
  })

  it('refuses a name shared by several certificates', () => {
    expect(() => findSigningIdentityHash('Apple Development: Team (AAA)', identities)).toThrow(
      'use its SHA-1'
    )
  })
})
