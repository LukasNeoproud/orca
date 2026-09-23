#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const appConfig = require('../app.json')
const DEFAULT_VERSION_CODE_BASE = 1_000_000
const VERSION_CODE_RUN_MULTIPLIER = 100
const ANDROID_VERSION_CODE_MAX = 2_100_000_000

function input(name) {
  return String(process.env[name] || '').trim()
}

function positiveInteger(value, name) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

export function resolvePrivateVersionCode(env) {
  const explicit = String(env.ORCA_PRIVATE_ANDROID_VERSION_CODE || '').trim()
  if (explicit) {
    return positiveInteger(explicit, 'ORCA_PRIVATE_ANDROID_VERSION_CODE')
  }

  const base = positiveInteger(
    String(env.ORCA_PRIVATE_ANDROID_VERSION_CODE_BASE || DEFAULT_VERSION_CODE_BASE),
    'ORCA_PRIVATE_ANDROID_VERSION_CODE_BASE'
  )
  const runNumber = positiveInteger(env.GITHUB_RUN_NUMBER, 'GITHUB_RUN_NUMBER')
  const runAttempt = positiveInteger(env.GITHUB_RUN_ATTEMPT, 'GITHUB_RUN_ATTEMPT')
  if (runAttempt >= VERSION_CODE_RUN_MULTIPLIER) {
    throw new Error(`GITHUB_RUN_ATTEMPT must be below ${VERSION_CODE_RUN_MULTIPLIER}`)
  }
  const versionCode = base + runNumber * VERSION_CODE_RUN_MULTIPLIER + runAttempt
  if (versionCode > ANDROID_VERSION_CODE_MAX) {
    throw new Error(`Private Android versionCode exceeds ${ANDROID_VERSION_CODE_MAX}`)
  }
  return versionCode
}

function writeOutput(name, value) {
  const outputPath = input('GITHUB_OUTPUT')
  if (outputPath) {
    fs.appendFileSync(outputPath, `${name}=${value}\n`)
  }
}

function main() {
  const packageName = input('ORCA_PRIVATE_ANDROID_PACKAGE')
  if (!packageName) {
    throw new Error('ORCA_PRIVATE_ANDROID_PACKAGE is required')
  }
  const versionCode = resolvePrivateVersionCode(process.env)
  const version = String(appConfig.expo.version || '').trim()
  if (!version) {
    throw new Error('mobile/app.json is missing expo.version')
  }

  writeOutput('package', packageName)
  writeOutput('version', version)
  writeOutput('version_code', String(versionCode))
  console.log(`Prepared private Android identity ${packageName}`)
  console.log(`Private Android version ${version} (${versionCode})`)
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === path.resolve(import.meta.filename)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
