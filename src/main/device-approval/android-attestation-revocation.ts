const REVOCATION_URL = 'https://android.googleapis.com/attestation/status'
const MAX_REVOCATION_BYTES = 4 * 1024 * 1024

export async function officialAndroidAttestationRevocation(
  serials: readonly string[]
): Promise<boolean> {
  const response = await fetch(REVOCATION_URL, {
    redirect: 'error',
    signal: AbortSignal.timeout(5_000)
  })
  if (!response.ok || !response.body) {
    throw new Error('Android revocation status unavailable')
  }
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > MAX_REVOCATION_BYTES) {
      throw new Error('Android revocation list is too large')
    }
    chunks.push(chunk)
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('entries' in parsed) ||
    !parsed.entries ||
    typeof parsed.entries !== 'object' ||
    Array.isArray(parsed.entries)
  ) {
    throw new Error('Malformed Android revocation list')
  }
  const entries = parsed.entries as Record<string, unknown>
  return serials.every((serial) => !Object.hasOwn(entries, serial))
}
