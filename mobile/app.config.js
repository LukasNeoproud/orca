const baseConfig = require('./app.json')

const OFFICIAL_ANDROID_PACKAGE = baseConfig.expo.android.package
const ANDROID_VERSION_CODE_MAX = 2_100_000_000
const androidPackagePattern = /^(?:[a-z][A-Za-z0-9_]*\.)+[a-z][A-Za-z0-9_]*$/
const schemePattern = /^[a-z][a-z0-9+.-]*$/

function required(env, name) {
  const value = String(env[name] || '').trim()
  if (!value) {
    throw new Error(`${name} is required for a private Android release`)
  }
  return value
}

function resolvePrivateAndroidConfig(config, env = process.env) {
  if (env.ORCA_PRIVATE_ANDROID_RELEASE !== '1') {
    return config
  }

  const packageName = required(env, 'ORCA_PRIVATE_ANDROID_PACKAGE')
  if (!androidPackagePattern.test(packageName)) {
    throw new Error('ORCA_PRIVATE_ANDROID_PACKAGE must be a valid reverse-DNS Android package')
  }
  if (packageName === OFFICIAL_ANDROID_PACKAGE) {
    throw new Error('Private Android package must differ from the official Orca Mobile package')
  }

  const rawVersionCode = required(env, 'ORCA_PRIVATE_ANDROID_VERSION_CODE')
  const versionCode = Number(rawVersionCode)
  if (
    !Number.isSafeInteger(versionCode) ||
    versionCode <= 0 ||
    versionCode > ANDROID_VERSION_CODE_MAX
  ) {
    throw new Error(
      `ORCA_PRIVATE_ANDROID_VERSION_CODE must be between 1 and ${ANDROID_VERSION_CODE_MAX}`
    )
  }

  const name = String(env.ORCA_PRIVATE_APP_NAME || 'Orca Private').trim()
  const scheme = String(env.ORCA_PRIVATE_APP_SCHEME || 'orca-private').trim()
  if (!name) {
    throw new Error('ORCA_PRIVATE_APP_NAME cannot be blank')
  }
  if (!schemePattern.test(scheme)) {
    throw new Error('ORCA_PRIVATE_APP_SCHEME must be a valid lowercase URL scheme')
  }

  return {
    ...config,
    name,
    scheme,
    android: {
      ...config.android,
      package: packageName,
      versionCode
    }
  }
}

module.exports = ({ config }) => resolvePrivateAndroidConfig(config)
module.exports.resolvePrivateAndroidConfig = resolvePrivateAndroidConfig
