import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

// Why a self-signed identity: keychain ACLs and TCC grants key on the designated requirement,
// which for this certificate stays the same across rebuilds, unlike an ad-hoc cdhash.
export const DEV_SIGNING_IDENTITY = 'Orca Dev Local Signing'
const LOGIN_KEYCHAIN = path.join(homedir(), 'Library', 'Keychains', 'login.keychain-db')

export function hasDevSigningIdentity(run = execFileSync) {
  const identities = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8'
  })
  return identities.includes(`"${DEV_SIGNING_IDENTITY}"`)
}

export function ensureDevSigningIdentity(run = execFileSync) {
  if (hasDevSigningIdentity(run)) {
    return false
  }
  const directory = mkdtempSync(path.join(tmpdir(), 'orca-dev-signing-'))
  try {
    const config = path.join(directory, 'openssl.cnf')
    const key = path.join(directory, 'key.pem')
    const certificate = path.join(directory, 'certificate.pem')
    const bundle = path.join(directory, 'identity.p12')
    const password = randomBytes(16).toString('hex')
    writeFileSync(
      config,
      [
        '[req]',
        'distinguished_name = dn',
        'x509_extensions = ext',
        'prompt = no',
        '[dn]',
        `CN = ${DEV_SIGNING_IDENTITY}`,
        '[ext]',
        'basicConstraints = critical, CA:false',
        'keyUsage = critical, digitalSignature',
        'extendedKeyUsage = critical, codeSigning',
        ''
      ].join('\n')
    )
    // LibreSSL from /usr/bin writes a PKCS#12 that `security import` accepts.
    run(
      '/usr/bin/openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '3650',
        '-config',
        config,
        '-keyout',
        key,
        '-out',
        certificate
      ],
      { stdio: 'pipe' }
    )
    run(
      '/usr/bin/openssl',
      [
        'pkcs12',
        '-export',
        '-inkey',
        key,
        '-in',
        certificate,
        '-out',
        bundle,
        '-name',
        DEV_SIGNING_IDENTITY,
        '-passout',
        `pass:${password}`
      ],
      { stdio: 'pipe' }
    )
    run(
      '/usr/bin/security',
      ['import', bundle, '-k', LOGIN_KEYCHAIN, '-P', password, '-T', '/usr/bin/codesign'],
      { stdio: 'pipe' }
    )
    // macOS asks for the user's password once to trust the certificate for code signing.
    run(
      '/usr/bin/security',
      ['add-trusted-cert', '-r', 'trustRoot', '-p', 'codeSign', '-k', LOGIN_KEYCHAIN, certificate],
      { stdio: 'inherit' }
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
  if (!hasDevSigningIdentity(run)) {
    throw new Error(`${DEV_SIGNING_IDENTITY} was imported but is not a valid signing identity.`)
  }
  return true
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  if (process.platform !== 'darwin') {
    throw new Error('The Orca Dev signing identity is macOS only.')
  }
  const created = ensureDevSigningIdentity()
  console.log(
    created
      ? `Created and trusted "${DEV_SIGNING_IDENTITY}" in the login keychain.`
      : `"${DEV_SIGNING_IDENTITY}" already exists.`
  )
}
