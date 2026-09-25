import AsyncStorage from '@react-native-async-storage/async-storage'
import { File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import { stopApkDownloadNotification } from '@orca/expo-apk-installer'
import { installDownloadedApkWhenForeground } from './mobile-apk-foreground-install'

const STORAGE_KEY = 'orca-pending-apk-install-v1'
type PendingApk = { uri: string; size: number; phase: 'downloading' | 'ready' }
const activeTransfers = new Set<string>()
let recovery: Promise<void> | null = null

function parsePending(raw: string | null): PendingApk | null {
  if (!raw) {
    return null
  }
  try {
    const value: unknown = JSON.parse(raw)
    const documentRoot = Paths.document.uri.replace(/\/?$/, '/')
    if (
      typeof value !== 'object' ||
      value === null ||
      !('uri' in value) ||
      typeof value.uri !== 'string' ||
      !value.uri.startsWith(documentRoot) ||
      !/^orca-install-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.apk$/i.test(
        value.uri.slice(documentRoot.length)
      ) ||
      !('size' in value) ||
      typeof value.size !== 'number' ||
      !Number.isSafeInteger(value.size) ||
      value.size <= 0 ||
      !('phase' in value) ||
      (value.phase !== 'downloading' && value.phase !== 'ready')
    ) {
      return null
    }
    return value as PendingApk
  } catch {
    return null
  }
}

export async function beginPendingApkDownload(uri: string, size: number): Promise<void> {
  activeTransfers.add(uri)
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ uri, size, phase: 'downloading' }))
  } catch (error) {
    activeTransfers.delete(uri)
    throw error
  }
}

export async function markPendingApkReady(uri: string, size: number): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ uri, size, phase: 'ready' }))
}

export async function clearPendingApkDownload(uri: string): Promise<void> {
  activeTransfers.delete(uri)
  const pending = parsePending(await AsyncStorage.getItem(STORAGE_KEY))
  if (pending?.uri === uri) {
    await AsyncStorage.removeItem(STORAGE_KEY)
  }
}

async function recoverPending(): Promise<void> {
  if (Platform.OS !== 'android') {
    return
  }
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  const pending = parsePending(raw)
  if (!pending) {
    if (raw) {
      await AsyncStorage.removeItem(STORAGE_KEY)
      await stopApkDownloadNotification().catch(() => {})
    }
    return
  }
  if (activeTransfers.has(pending.uri)) {
    return
  }
  const file = new File(pending.uri)
  try {
    if (pending.phase === 'ready' && file.exists && file.info().size === pending.size) {
      await installDownloadedApkWhenForeground(pending.uri)
    }
  } finally {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY)
      if (file.exists) {
        file.delete()
      }
    } finally {
      await stopApkDownloadNotification().catch(() => {})
    }
  }
}

export function recoverPendingApkInstallation(): Promise<void> {
  recovery ??= recoverPending().finally(() => {
    recovery = null
  })
  return recovery
}
