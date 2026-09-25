import { AppState } from 'react-native'
import { installApk } from '@orca/expo-apk-installer'

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('APK download cancelled.')
  }
}

function isBackgroundRejection(reason: unknown): boolean {
  return (
    typeof reason === 'object' &&
    reason !== null &&
    'code' in reason &&
    reason.code === 'APK_APP_BACKGROUND'
  )
}

export function waitForApkInstallForeground(
  signal?: AbortSignal,
  requireActiveEvent = false
): Promise<void> {
  assertNotCancelled(signal)
  return new Promise((resolve, reject) => {
    let settled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    const finish = (error?: Error) => {
      if (settled) {
        return
      }
      settled = true
      subscription.remove()
      signal?.removeEventListener('abort', onAbort)
      if (retryTimer !== null) {
        clearTimeout(retryTimer)
      }
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    const onAbort = () => finish(new Error('APK download cancelled.'))
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        finish()
      }
    })
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) {
      onAbort()
    } else if (!requireActiveEvent && AppState.currentState === 'active') {
      finish()
    } else if (requireActiveEvent) {
      retryTimer = setTimeout(() => {
        if (AppState.currentState === 'active') {
          finish()
        }
      }, 250)
    }
  })
}

export async function runApkActionWhenForeground(
  action: () => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  let requireActiveEvent = false
  for (;;) {
    await waitForApkInstallForeground(signal, requireActiveEvent)
    assertNotCancelled(signal)
    try {
      await action()
      return
    } catch (reason) {
      if (!isBackgroundRejection(reason)) {
        throw reason
      }
      requireActiveEvent = true
    }
  }
}

export async function installDownloadedApkWhenForeground(
  localApkUri: string,
  signal?: AbortSignal
): Promise<void> {
  await runApkActionWhenForeground(() => installApk(localApkUri), signal)
}
