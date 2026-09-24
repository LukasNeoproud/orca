import type { BackendAvailability, EmulatorDevice } from '../backends/emulator-backend'
import type { AndroidSdkPaths } from './android-sdk-discovery'

export async function checkAndroidBackendAvailability(
  sdk: AndroidSdkPaths | null,
  listDevices: () => Promise<EmulatorDevice[]>
): Promise<BackendAvailability> {
  if (!sdk) {
    return {
      available: false,
      devices: [],
      message: 'Android SDK not found. Install Android Studio and set ANDROID_HOME.'
    }
  }
  const sdkPath = sdk.sdkRoot
  let devices: EmulatorDevice[] = []
  try {
    devices = await listDevices()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'adb is unavailable.'
    return { available: false, devices: [], message, sdkPath }
  }
  if (devices.length === 0) {
    return {
      available: false,
      devices,
      message: 'No Android devices or AVDs found. Create one in Android Studio.',
      sdkPath
    }
  }
  return { available: true, devices, message: 'Ready', sdkPath }
}
