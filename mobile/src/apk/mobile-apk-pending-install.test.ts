import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginPendingApkDownload,
  clearPendingApkDownload,
  markPendingApkReady,
  recoverPendingApkInstallation
} from './mobile-apk-pending-install'

const state = vi.hoisted(() => ({
  stored: null as string | null,
  exists: true,
  size: 123,
  deleted: false,
  installed: vi.fn(async (_uri: string) => {}),
  stopped: vi.fn(async () => {})
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => state.stored,
    setItem: async (_key: string, value: string) => {
      state.stored = value
    },
    removeItem: async () => {
      state.stored = null
    }
  }
}))
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }))
vi.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///documents/' } },
  File: class {
    constructor(readonly uri: string) {}
    get exists() {
      return state.exists
    }
    info() {
      return { size: state.size }
    }
    delete() {
      state.exists = false
      state.deleted = true
    }
  }
}))
vi.mock('@orca/expo-apk-installer', () => ({ stopApkDownloadNotification: state.stopped }))
vi.mock('./mobile-apk-foreground-install', () => ({
  installDownloadedApkWhenForeground: state.installed
}))

const uri = 'file:///documents/orca-install-00000000-0000-0000-0000-000000000000.apk'

describe('pending APK install recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.stored = null
    state.exists = true
    state.size = 123
    state.deleted = false
  })

  it('restores a completed APK after process restart', async () => {
    state.stored = JSON.stringify({ uri, size: 123, phase: 'ready' })
    await recoverPendingApkInstallation()
    expect(state.installed).toHaveBeenCalledWith(uri)
    expect(state.deleted).toBe(true)
    expect(state.stored).toBeNull()
    expect(state.stopped).toHaveBeenCalledOnce()
  })

  it('cleans an interrupted partial download without opening installer', async () => {
    state.stored = JSON.stringify({ uri, size: 123, phase: 'downloading' })
    await recoverPendingApkInstallation()
    expect(state.installed).not.toHaveBeenCalled()
    expect(state.deleted).toBe(true)
  })

  it('does not steal a live transfer and clears its journal after completion', async () => {
    await beginPendingApkDownload(uri, 123)
    await markPendingApkReady(uri, 123)
    await recoverPendingApkInstallation()
    expect(state.installed).not.toHaveBeenCalled()
    expect(state.deleted).toBe(false)
    await clearPendingApkDownload(uri)
    expect(state.stored).toBeNull()
  })

  it('rejects a journal path outside Orca APK downloads', async () => {
    state.stored = JSON.stringify({
      uri: 'file:///documents/other.apk',
      size: 123,
      phase: 'ready'
    })
    await recoverPendingApkInstallation()
    expect(state.installed).not.toHaveBeenCalled()
    expect(state.deleted).toBe(false)
    expect(state.stored).toBeNull()
  })
})
