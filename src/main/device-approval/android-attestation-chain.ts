import { X509Certificate } from 'node:crypto'

function certificateTime(certificate: X509Certificate, now: number): void {
  const notBefore = Date.parse(certificate.validFrom)
  const notAfter = Date.parse(certificate.validTo)
  if (
    !Number.isFinite(notBefore) ||
    !Number.isFinite(notAfter) ||
    now < notBefore ||
    now > notAfter
  ) {
    throw new Error('Android attestation certificate is outside its validity period')
  }
}

export function verifyAndroidAttestationChain(
  chain: X509Certificate[],
  roots: readonly string[],
  now: number
): void {
  const trusted = roots.map((pem) => new X509Certificate(pem))
  const last = chain.at(-1)!
  const root =
    trusted.find((candidate) => candidate.raw.equals(last.raw)) ??
    trusted.find((candidate) => last.checkIssued(candidate) && last.verify(candidate.publicKey))
  if (!root) {
    throw new Error('Android attestation chain has no trusted Google root')
  }
  if (!last.raw.equals(root.raw)) {
    chain.push(root)
  }
  for (let index = 0; index < chain.length; index++) {
    const certificate = chain[index]!
    certificateTime(certificate, now)
    if (index === 0 && certificate.ca) {
      throw new Error('Android attestation key certificate is a CA')
    }
    if (index > 0 && !certificate.ca) {
      throw new Error('Android attestation issuer is not a CA')
    }
    if (index + 1 < chain.length) {
      const issuer = chain[index + 1]!
      if (!certificate.checkIssued(issuer) || !certificate.verify(issuer.publicKey)) {
        throw new Error('Invalid Android attestation certificate signature')
      }
    } else if (!certificate.verify(certificate.publicKey)) {
      throw new Error('Invalid Google attestation root signature')
    }
  }
}
