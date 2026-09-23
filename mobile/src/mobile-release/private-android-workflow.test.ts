import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  fileURLToPath(
    new URL('../../../.github/workflows/mobile-android-private-distribution.yml', import.meta.url)
  ),
  'utf8'
)

describe('private Android distribution workflow', () => {
  it('is manual-only and does not publish a public release or artifact', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toContain('push:')
    expect(workflow).not.toContain('actions/upload-artifact')
    expect(workflow).not.toContain('gh release')
  })

  it('requires private signing and scopes Firebase distribution to tester groups', () => {
    expect(workflow).toContain('ORCA_PRIVATE_ANDROID_SIGNING:')
    expect(workflow).toContain('google-github-actions/auth@v3')
    expect(workflow).toContain('--groups "$FIREBASE_TESTER_GROUPS"')
    expect(workflow).toContain('firebase-tools@15.30.2')
    expect(workflow).toContain('testing_uri=')
  })
})
