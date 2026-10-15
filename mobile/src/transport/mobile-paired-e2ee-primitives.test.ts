import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { MOBILE_PAIRED_E2EE_PRIMITIVES } from './mobile-paired-e2ee-primitives'

// Why: ./e2ee pulls expo-crypto, whose React Native entry cannot load under Node.
vi.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n) }))

describe('MOBILE_PAIRED_E2EE_PRIMITIVES.inflateGzip', () => {
  it('inflates the gzip stream the desktop writes with node:zlib', () => {
    const payload = new TextEncoder().encode('\u001b[32mok\u001b[0m\r\n'.repeat(500))
    expect(MOBILE_PAIRED_E2EE_PRIMITIVES.inflateGzip?.(gzipSync(payload, { level: 5 }))).toEqual(
      payload
    )
  })
})
