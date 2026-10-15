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
  it('builds patched React Native Android sources instead of the precompiled AAR', () => {
    const { expo } = require('../../app.json')
    const { updateAndroidSettingsGradle } = require('expo-build-properties/build/android')
    const [, properties] = expo.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties'
    )
    const settings = updateAndroidSettingsGradle({
      contents: 'include ":app"\n',
      buildFromSource: properties.android.buildReactNativeFromSource
    })
    expect(settings).toContain(
      'substitute(module("com.facebook.react:react-android")).using(project(":packages:react-native:ReactAndroid"))'
    )
  })

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

  it("drops the official app's Firebase config, which names no private package", () => {
    const official = {
      ...base,
      android: { ...base.android, googleServicesFile: './google-services.json' }
    }
    expect(
      resolvePrivateAndroidConfig(official, {
        ORCA_PRIVATE_ANDROID_RELEASE: '1',
        ORCA_PRIVATE_ANDROID_PACKAGE: 'dev.example.orca.privateapp',
        ORCA_PRIVATE_ANDROID_VERSION_CODE: '1001203'
      }).android
    ).toEqual({ package: 'dev.example.orca.privateapp', versionCode: 1001203 })
    expect(resolvePrivateAndroidConfig(official, {})).toBe(official)
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
