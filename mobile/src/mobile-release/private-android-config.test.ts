import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { resolvePrivateAndroidConfig } = require('../../app.config.js') as {
  resolvePrivateAndroidConfig: (
    config: Record<string, unknown>,
    env: Record<string, string>
  ) => Record<string, unknown>
}

const base = {
  name: 'Orca',
  scheme: 'orca',
  android: { package: 'com.stably.orca.mobile', versionCode: 16 }
}

describe('private Android Expo config', () => {
  it('keeps the public identity when private release mode is disabled', () => {
    expect(resolvePrivateAndroidConfig(base, {})).toBe(base)
  })

  it('uses a side-by-side private identity and explicit version code', () => {
    expect(
      resolvePrivateAndroidConfig(base, {
        ORCA_PRIVATE_ANDROID_RELEASE: '1',
        ORCA_PRIVATE_ANDROID_PACKAGE: 'dev.example.orca.privateapp',
        ORCA_PRIVATE_ANDROID_VERSION_CODE: '1001203'
      })
    ).toEqual({
      name: 'Orca Private',
      scheme: 'orca-private',
      android: { package: 'dev.example.orca.privateapp', versionCode: 1001203 }
    })
    expect(base.android.package).toBe('com.stably.orca.mobile')
  })

  it('rejects the official package and invalid version codes', () => {
    expect(() =>
      resolvePrivateAndroidConfig(base, {
        ORCA_PRIVATE_ANDROID_RELEASE: '1',
        ORCA_PRIVATE_ANDROID_PACKAGE: 'com.stably.orca.mobile',
        ORCA_PRIVATE_ANDROID_VERSION_CODE: '100'
      })
    ).toThrow('must differ')
    expect(() =>
      resolvePrivateAndroidConfig(base, {
        ORCA_PRIVATE_ANDROID_RELEASE: '1',
        ORCA_PRIVATE_ANDROID_PACKAGE: 'dev.example.orca.privateapp',
        ORCA_PRIVATE_ANDROID_VERSION_CODE: '0'
      })
    ).toThrow('must be between')
  })
})
