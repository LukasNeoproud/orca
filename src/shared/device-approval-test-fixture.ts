export function approvalFixture(now = Date.now()) {
  return {
    version: 1,
    requestId: 'a'.repeat(32),
    nonce: 'b'.repeat(43),
    keyId: 'c'.repeat(64),
    createdAt: now,
    expiresAt: now + 120_000,
    operation: {
      kind: 'private-android-distribution',
      mode: 'publish',
      commit: 'd'.repeat(40),
      firebaseAppId: '1:100414786379:android:410ca57940be633c0676ce',
      packageName: 'cz.neoproud.orca.dev',
      groups: ['testers'],
      releaseNotesSha256: 'e'.repeat(64)
    },
    requests: [
      'android-keystore-base64',
      'android-keystore-password',
      'android-key-alias',
      'android-key-password',
      'firebase-service-account-json'
    ].map((account) => ({ service: 'cz.neoproud.orca.dev.private-distribution', account }))
  }
}
