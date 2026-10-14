import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

// Why a self-signed identity: keychain ACLs and TCC grants key on the designated requirement,
// which for this certificate stays the same across rebuilds, unlike an ad-hoc cdhash.
export const DEV_SIGNING_IDENTITY = 'Orca Dev Local Signing'
const LOGIN_KEYCHAIN = path.join(homedir(), 'Library', 'Keychains', 'login.keychain-db')

/**
 * ORCA_DEV_SIGNING_IDENTITY picks any codesigning identity by name or SHA-1. Prefer an Apple
 * Development one: without a team ID the keychain's partition list keys on each build's cdhash,
 * so the self-signed default re-asks for keychain access after every install.
 */
export function resolveDevSigningIdentity(env = process.env) {
  return env.ORCA_DEV_SIGNING_IDENTITY?.trim() || DEV_SIGNING_IDENTITY
}

function listSigningIdentities(run) {
  const output = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8'
  })
  return [...output.matchAll(/^\s*\d+\)\s+([0-9A-F]{40})\s+"(.*)"$/gim)].map((match) => ({
    hash: match[1].toUpperCase(),
    name: match[2]
  }))
}

/** SHA-1 of the one valid identity matching `identity` by name or hash. */
export function findSigningIdentityHash(identity, run = execFileSync) {
  const matches = listSigningIdentities(run).filter(
    (entry) => entry.hash === identity.toUpperCase() || entry.name === identity
  )
  const hashes = [...new Set(matches.map((entry) => entry.hash))]
  if (hashes.length > 1) {
    throw new Error(`Several signing identities are named "${identity}"; use its SHA-1 instead.`)
  }
  return hashes[0] ?? null
}

export function hasDevSigningIdentity(run = execFileSync) {
  return findSigningIdentityHash(DEV_SIGNING_IDENTITY, run) !== null
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
