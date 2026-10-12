const baseConfig = require('./app.json')

// Why this file exists: a bare "expo-notifications" plugin entry writes
// `aps-environment: development` into the iOS entitlements, while push-token.ts
// reports `production` for every non-__DEV__ build. A TestFlight or App Store build
// would then register a production APNs token against a sandbox entitlement, and the
// gateway's pushes would be accepted by Apple and delivered nowhere. Deriving the
// mode from an env var the release workflow sets makes the two agree by construction
// instead of relying on the export step to rewrite the entitlement.
//
// app.json stays the source for everything else: Expo reads it first and hands it to
// this function, so the fastlane version/buildNumber rewrite still flows through.
const APS_ENVIRONMENT =
  process.env.ORCA_IOS_APS_ENVIRONMENT === 'production' ? 'production' : 'development'

function withNotificationEntitlements(config) {
  return {
    ...config,
    ios: {
      ...config.ios,
      entitlements: { ...config.ios?.entitlements, 'aps-environment': APS_ENVIRONMENT }
    },
    plugins: (config.plugins ?? []).map((plugin) =>
      plugin === 'expo-notifications'
        ? [
            'expo-notifications',
            {
              enableBackgroundRemoteNotifications: true,
              mode: APS_ENVIRONMENT,
              icon: './assets/notification-icon.png'
            }
          ]
        : plugin
    )
  }
}

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

module.exports = ({ config }) => resolvePrivateAndroidConfig(withNotificationEntitlements(config))
module.exports.resolvePrivateAndroidConfig = resolvePrivateAndroidConfig
