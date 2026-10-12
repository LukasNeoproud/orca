import { Buffer } from 'buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installMobileApkBuild } from './mobile-apk-transfer'
import type { RpcClient } from '../transport/rpc-client'

const state = vi.hoisted(() => ({
  installed: vi.fn(async (_uri: string) => {}),
  notificationStarted: vi.fn(async (_title: string) => {}),
  notificationUpdated: vi.fn(async (_percent: number) => {}),
  notificationReady: vi.fn(async () => {}),
  notificationStopped: vi.fn(async () => {}),
  pendingBegan: vi.fn(async (_uri: string, _size: number) => {}),
  pendingReady: vi.fn(async (_uri: string, _size: number) => {}),
  pendingCleared: vi.fn(async (_uri: string) => {}),
  notificationsAllowed: true,
  released: vi.fn(),
  appState: 'active',
  appStateListeners: new Set<(state: string) => void>(),
  deleted: false,
  bytes: [] as Uint8Array[]
}))
vi.mock('@orca/expo-apk-installer', () => ({
  installApk: state.installed,
  startApkDownloadNotification: state.notificationStarted,
  updateApkDownloadNotification: state.notificationUpdated,
  markApkDownloadReady: state.notificationReady,
  stopApkDownloadNotification: state.notificationStopped
}))
vi.mock('../transport/host-logical-client', () => ({
  retainHostLogicalClientDuringBackgroundTransfer: () => {
    let released = false
    return () => {
      if (released) {
        return
      }
      released = true
      state.released()
    }
  }
}))
vi.mock('../notifications/notification-permissions', () => ({
  ensureNotificationPermissions: async () => state.notificationsAllowed
}))
vi.mock('./mobile-apk-pending-install', () => ({
  beginPendingApkDownload: state.pendingBegan,
  markPendingApkReady: state.pendingReady,
  clearPendingApkDownload: state.pendingCleared
}))
vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return state.appState
    },
    addEventListener: (_event: string, listener: (next: string) => void) => {
      state.appStateListeners.add(listener)
      return { remove: () => state.appStateListeners.delete(listener) }
    }
  }
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'test-id' }))
vi.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents' },
  File: class {
    uri = 'file:///documents/orca-install-test-id.apk'
    exists = false
    create() {
      this.exists = true
      state.deleted = false
      state.bytes = []
    }
    open() {
      return { writeBytes: (bytes: Uint8Array) => state.bytes.push(bytes), close: () => {} }
    }
    info() {
      return { size: state.bytes.reduce((sum, bytes) => sum + bytes.length, 0) }
    }
    delete() {
      this.exists = false
      state.deleted = true
    }
  }
}))

const data = Buffer.alloc(280_000, 7)
data[0] = 0x50
data[1] = 0x4b
const build = {
  relativePath: 'mobile/android/app/build/outputs/apk/release/app.apk',
  size: data.length,
  mtime: 2
}

function clientWithChunks(corrupt = false): RpcClient {
  return {
    sendRequest: vi.fn(async (method: string, params: { offset?: number; length?: number }) => {
      if (method === 'files.stat') {
        return { ok: true, result: { ...build, isDirectory: false } }
      }
      if (method === 'files.readChunk') {
        const bytes = data.subarray(
          params.offset!,
          params.offset! + params.length! - (corrupt ? 1 : 0)
        )
        return {
          ok: true,
          result: {
            contentBase64: bytes.toString('base64'),
            bytesRead: bytes.length,
            eof: params.offset! + bytes.length >= data.length
          }
        }
      }
      throw new Error(`Unexpected ${method}`)
    })
  } as unknown as RpcClient
}

describe('mobile APK transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.appState = 'active'
    state.appStateListeners.clear()
    state.notificationsAllowed = true
  })

  it('streams bounded chunks, verifies size, opens installer, and removes cache file', async () => {
    state.installed.mockClear()
    const client = clientWithChunks()
    const progress: number[] = []
    await installMobileApkBuild(client, 'wt-1', build, (value) => progress.push(value))
    expect(
      (client.sendRequest as ReturnType<typeof vi.fn>).mock.calls
        .filter(([method]) => method === 'files.readChunk')
        .map(([, params]) => params.offset)
    ).toEqual([0, 256 * 1024])
    expect(Buffer.concat(state.bytes)).toEqual(data)
    expect(progress.at(-1)).toBe(1)
    expect(state.installed).toHaveBeenCalledWith('file:///documents/orca-install-test-id.apk')
    expect(state.notificationStarted).toHaveBeenCalledWith('app.apk')
    expect(state.notificationUpdated).toHaveBeenCalledWith(100)
    expect(state.notificationReady).toHaveBeenCalledOnce()
    expect(state.notificationStopped).toHaveBeenCalledOnce()
    expect(state.released).toHaveBeenCalledOnce()
    expect(state.deleted).toBe(true)
  })

  it('waits for foreground after a download finishes in background', async () => {
    const transfer = installMobileApkBuild(clientWithChunks(), 'wt-1', build, (progress) => {
      if (progress === 1) {
        state.appState = 'background'
      }
    })
    await vi.waitFor(() => expect(state.notificationReady).toHaveBeenCalledOnce())
    expect(state.installed).not.toHaveBeenCalled()
    expect(state.deleted).toBe(false)
    state.appState = 'active'
    for (const listener of state.appStateListeners) {
      listener('active')
    }
    await transfer
    expect(state.installed).toHaveBeenCalledOnce()
    expect(state.deleted).toBe(true)
  })

  it('retries only on the next foreground after Android rejects a background launch', async () => {
    state.installed.mockRejectedValueOnce(
      Object.assign(new Error('Orca is backgrounded'), { code: 'APK_APP_BACKGROUND' })
    )
    const transfer = installMobileApkBuild(clientWithChunks(), 'wt-1', build, () => {})
    await vi.waitFor(() => expect(state.installed).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(state.appStateListeners.size).toBe(1))
    state.appState = 'background'
    for (const listener of state.appStateListeners) {
      listener('background')
    }
    expect(state.installed).toHaveBeenCalledOnce()
    state.appState = 'active'
    for (const listener of state.appStateListeners) {
      listener('active')
    }
    await transfer
    expect(state.installed).toHaveBeenCalledTimes(2)
  })

  it('recovers when the foreground event precedes the native rejection reply', async () => {
    state.installed.mockRejectedValueOnce(
      Object.assign(new Error('Orca is backgrounded'), { code: 'APK_APP_BACKGROUND' })
    )
    await installMobileApkBuild(clientWithChunks(), 'wt-1', build, () => {})
    expect(state.installed).toHaveBeenCalledTimes(2)
  })

  it('cancels a completed background download without opening the installer later', async () => {
    const controller = new AbortController()
    const transfer = installMobileApkBuild(
      clientWithChunks(),
      'wt-1',
      build,
      (progress) => {
        if (progress === 1) {
          state.appState = 'background'
        }
      },
      controller.signal
    )
    await vi.waitFor(() => expect(state.notificationReady).toHaveBeenCalledOnce())
    controller.abort()
    await expect(transfer).rejects.toThrow('cancelled')
    state.appState = 'active'
    for (const listener of state.appStateListeners) {
      listener('active')
    }
    expect(state.installed).not.toHaveBeenCalled()
    expect(state.deleted).toBe(true)
    expect(state.notificationStopped).toHaveBeenCalledOnce()
  })

  it('does not start an invisible download when notification permission is denied', async () => {
    state.notificationsAllowed = false
    await expect(
      installMobileApkBuild(clientWithChunks(), 'wt-1', build, () => {})
    ).rejects.toThrow('notifications')
    expect(state.notificationStarted).not.toHaveBeenCalled()
    expect(state.installed).not.toHaveBeenCalled()
  })

  it('refuses to launch installer if source APK changes during download', async () => {
    state.installed.mockClear()
    const client = clientWithChunks()
    const sendRequest = vi.mocked(client.sendRequest)
    const original = sendRequest.getMockImplementation()!
    let stats = 0
    sendRequest.mockImplementation(async (method, params) => {
      if (method === 'files.stat' && ++stats === 2) {
        return {
          id: 'stat-2',
          ok: true,
          result: { ...build, mtime: build.mtime + 1, isDirectory: false }
        }
      }
      return original(method, params)
    })
    await expect(installMobileApkBuild(client, 'wt-1', build, () => {})).rejects.toThrow(
      'changed during download'
    )
    expect(state.installed).not.toHaveBeenCalled()
    expect(state.deleted).toBe(true)
  })

  it('rejects a short chunk before installation and removes partial download', async () => {
    state.installed.mockClear()
    await expect(
      installMobileApkBuild(clientWithChunks(true), 'wt-1', build, () => {})
    ).rejects.toThrow('complete')
    expect(state.installed).not.toHaveBeenCalled()
    expect(state.deleted).toBe(true)
  })
})
