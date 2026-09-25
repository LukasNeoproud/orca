import { Buffer } from 'buffer'
import { randomUUID } from 'expo-crypto'
import { File, Paths } from 'expo-file-system'
import {
  markApkDownloadReady,
  startApkDownloadNotification,
  stopApkDownloadNotification,
  updateApkDownloadNotification
} from '@orca/expo-apk-installer'
import type { RpcClient } from '../transport/rpc-client'
import { retainHostLogicalClientDuringBackgroundTransfer } from '../transport/host-logical-client'
import { ensureNotificationPermissions } from '../notifications/notification-permissions'
import type { MobileApkBuild } from './mobile-apk-builds'
import {
  beginPendingApkDownload,
  clearPendingApkDownload,
  markPendingApkReady
} from './mobile-apk-pending-install'
import {
  installDownloadedApkWhenForeground,
  runApkActionWhenForeground,
  waitForApkInstallForeground
} from './mobile-apk-foreground-install'

type FileStat = { size: number; mtime: number; isDirectory: boolean }
type FileChunk = { contentBase64: string; bytesRead: number; eof: boolean }
const CHUNK_BYTES = 256 * 1024

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('APK download cancelled.')
  }
}

async function requestResult<T>(client: RpcClient, method: string, params: unknown): Promise<T> {
  const response = await client.sendRequest(method, params, {
    failWhenDisconnected: true,
    timeoutMs: 60_000
  })
  if (!response.ok) {
    if (response.error.code === 'method_not_found') {
      throw new Error('Update the paired Orca desktop to use APK installation.')
    }
    throw new Error(response.error.message || `${method} failed`)
  }
  return response.result as T
}

function matchesBuild(stat: FileStat, build: MobileApkBuild): boolean {
  return !stat.isDirectory && stat.size === build.size && stat.mtime === build.mtime
}

export async function installMobileApkBuild(
  client: RpcClient,
  worktreeId: string,
  build: MobileApkBuild,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal
): Promise<void> {
  if (
    !build.relativePath.toLowerCase().endsWith('.apk') ||
    !Number.isSafeInteger(build.size) ||
    build.size <= 0
  ) {
    throw new Error('Select a valid APK build.')
  }
  const worktree = `id:${worktreeId}`
  const selector = { worktree, relativePath: build.relativePath }
  assertNotAborted(signal)
  const initial = await requestResult<FileStat>(client, 'files.stat', selector)
  if (!matchesBuild(initial, build)) {
    throw new Error('This APK changed. Refresh the build list and try again.')
  }
  await waitForApkInstallForeground(signal)
  if (!(await ensureNotificationPermissions())) {
    throw new Error('Allow Orca notifications to show APK download progress.')
  }
  await runApkActionWhenForeground(
    () => startApkDownloadNotification(build.relativePath.split(/[\\/]/).at(-1) ?? 'APK'),
    signal
  )
  const releaseConnection = retainHostLogicalClientDuringBackgroundTransfer(client)
  const local = new File(Paths.document, `orca-install-${randomUUID()}.apk`)
  let handle: ReturnType<File['open']> | null = null
  try {
    await beginPendingApkDownload(local.uri, build.size)
    local.create()
    handle = local.open()
    let offset = 0
    let reportedPercent = 0
    while (offset < build.size) {
      assertNotAborted(signal)
      const length = Math.min(CHUNK_BYTES, build.size - offset)
      const chunk = await requestResult<FileChunk>(client, 'files.readChunk', {
        ...selector,
        offset,
        length
      })
      const bytes = Buffer.from(chunk.contentBase64, 'base64')
      if (
        chunk.bytesRead !== length ||
        bytes.length !== length ||
        (chunk.eof && offset + length !== build.size)
      ) {
        throw new Error('APK download ended before the file was complete.')
      }
      if (offset === 0 && (bytes[0] !== 0x50 || bytes[1] !== 0x4b)) {
        throw new Error('Selected file is not an APK archive.')
      }
      handle.writeBytes(bytes)
      offset += length
      onProgress(offset / build.size)
      const percent = Math.floor((offset / build.size) * 100)
      if (percent > reportedPercent) {
        reportedPercent = percent
        await updateApkDownloadNotification(percent)
      }
    }
    handle.close()
    handle = null
    assertNotAborted(signal)
    const current = await requestResult<FileStat>(client, 'files.stat', selector)
    if (!matchesBuild(current, build) || local.info().size !== build.size) {
      throw new Error('APK changed during download. Refresh the build list and try again.')
    }
    releaseConnection()
    await markPendingApkReady(local.uri, build.size)
    await markApkDownloadReady()
    await installDownloadedApkWhenForeground(local.uri, signal)
  } finally {
    releaseConnection()
    try {
      handle?.close()
      await clearPendingApkDownload(local.uri).catch(() => {})
      if (local.exists) {
        local.delete()
      }
    } finally {
      await stopApkDownloadNotification().catch(() => {})
    }
  }
}
