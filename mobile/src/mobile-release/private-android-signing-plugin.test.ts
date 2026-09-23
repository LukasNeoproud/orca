import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { applyPrivateReleaseSigning } =
  require('../../plugins/android-private-release-signing.js') as {
    applyPrivateReleaseSigning: (contents: string) => string
  }

const gradleFixture = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}
`

describe('private Android signing config plugin', () => {
  it('keeps debug signing as the public fallback and selects private release credentials by env', () => {
    const transformed = applyPrivateReleaseSigning(gradleFixture)

    expect(transformed).toContain('privateRelease {')
    expect(transformed).toContain('System.getenv("ORCA_PRIVATE_ANDROID_KEYSTORE_PATH")')
    expect(transformed).toContain(
      'System.getenv("ORCA_PRIVATE_ANDROID_SIGNING") == "true" ? signingConfigs.privateRelease : signingConfigs.debug'
    )
    expect(transformed).not.toContain('storePassword "')
    expect(applyPrivateReleaseSigning(transformed)).toBe(transformed)
  })
})
