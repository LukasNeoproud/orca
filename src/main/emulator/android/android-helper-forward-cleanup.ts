import type { AndroidCommandRunner } from './android-command-runner'
import type { AndroidSdkPaths } from './android-sdk-discovery'

export async function removeOrphanedAndroidForwards(
  deviceId: string,
  runner: AndroidCommandRunner,
  sdk: AndroidSdkPaths | null,
  resolveDeviceId: (deviceId: string) => Promise<string>
): Promise<void> {
  if (!sdk) {
    return
  }
  const serial = await resolveDeviceId(deviceId).catch(() => null)
  if (!serial) {
    return
  }
  await runner(sdk.adb, ['-s', serial, 'forward', '--remove-all']).catch(() => {})
}
