import { Buffer } from 'buffer'
import type { RpcClient } from '../transport/rpc-client'

export type MobileApkBuild = { relativePath: string; size: number; mtime: number }
type DirectoryEntry = { name: string; isDirectory: boolean; isSymlink?: boolean }
type FileStat = { size: number; mtime: number; isDirectory: boolean }
type FileChunk = { contentBase64: string; bytesRead: number; eof: boolean }

const DEFAULT_OUTPUT_ROOTS = [
  'mobile/android/app/build/outputs/apk',
  'android/app/build/outputs/apk',
  'app/build/outputs/apk',
  'build/outputs/apk'
]
const MAX_DIRECTORIES = 80
const MAX_APKS = 40
const MAX_DEPTH = 5

function normalizedDirectory(input: string): string {
  const value = input.replaceAll('\\', '/').replace(/\/$/, '')
  if (
    !value ||
    value.startsWith('/') ||
    value.length > 512 ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('Use a directory path relative to this workspace.')
  }
  return value
}

async function requestResult<T>(client: RpcClient, method: string, params: unknown): Promise<T> {
  const response = await client.sendRequest(method, params, {
    failWhenDisconnected: true,
    timeoutMs: 30_000
  })
  if (!response.ok) {
    if (response.error.code === 'method_not_found') {
      throw new Error('Update the paired Orca desktop to use APK installation.')
    }
    throw new Error(response.error.message || `${method} failed`)
  }
  return response.result as T
}

function isMissingDirectory(error: unknown): boolean {
  return (
    error instanceof Error && /ENOENT|not found|no such file|does not exist/i.test(error.message)
  )
}

function isApkPath(path: string): boolean {
  return path.toLowerCase().endsWith('.apk')
}

async function isCompleteZip(
  client: RpcClient,
  worktree: string,
  path: string,
  size: number
): Promise<boolean> {
  if (size < 22) {
    return false
  }
  const tailLength = Math.min(size, 65_557)
  const tail = await requestResult<FileChunk>(client, 'files.readChunk', {
    worktree,
    relativePath: path,
    offset: size - tailLength,
    length: tailLength
  })
  if (tail.bytesRead !== tailLength) {
    return false
  }
  const bytes = Buffer.from(tail.contentBase64, 'base64')
  if (bytes.length !== tailLength) {
    return false
  }
  for (let offset = bytes.length - 22; offset >= 0; offset--) {
    if (
      bytes.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length
    ) {
      return true
    }
  }
  return false
}

export async function listMobileApkBuilds(
  client: RpcClient,
  worktreeId: string,
  rootPath?: string
): Promise<MobileApkBuild[]> {
  const worktree = `id:${worktreeId}`
  const roots = rootPath?.trim() ? [normalizedDirectory(rootPath.trim())] : DEFAULT_OUTPUT_ROOTS
  const pending = roots.map((relativePath) => ({ relativePath, depth: 0 }))
  const seen = new Set<string>()
  const apkPaths: string[] = []
  while (pending.length && seen.size < MAX_DIRECTORIES && apkPaths.length < MAX_APKS) {
    const item = pending.shift()!
    if (seen.has(item.relativePath)) {
      continue
    }
    seen.add(item.relativePath)
    let entries: DirectoryEntry[]
    try {
      entries = await requestResult<DirectoryEntry[]>(client, 'files.readDir', {
        worktree,
        relativePath: item.relativePath
      })
    } catch (error) {
      if (isMissingDirectory(error)) {
        continue
      }
      throw error
    }
    for (const entry of entries) {
      if (
        !entry.name ||
        entry.name === '.' ||
        entry.name === '..' ||
        entry.name.includes('/') ||
        entry.name.includes('\\') ||
        entry.isSymlink
      ) {
        continue
      }
      const path = `${item.relativePath}/${entry.name}`
      if (entry.isDirectory && item.depth < MAX_DEPTH) {
        pending.push({ relativePath: path, depth: item.depth + 1 })
      } else if (!entry.isDirectory && isApkPath(path)) {
        apkPaths.push(path)
      }
      if (apkPaths.length >= MAX_APKS) {
        break
      }
    }
  }
  const candidates = await Promise.all(
    apkPaths.map(async (relativePath) => {
      try {
        const stat = await requestResult<FileStat>(client, 'files.stat', { worktree, relativePath })
        if (
          stat.isDirectory ||
          stat.size <= 0 ||
          !Number.isSafeInteger(stat.size) ||
          !Number.isFinite(stat.mtime)
        ) {
          return null
        }
        if (!(await isCompleteZip(client, worktree, relativePath, stat.size))) {
          return null
        }
        return { relativePath, size: stat.size, mtime: stat.mtime }
      } catch (error) {
        if (isMissingDirectory(error)) {
          return null
        }
        throw error
      }
    })
  )
  return candidates
    .filter((candidate): candidate is MobileApkBuild => candidate !== null)
    .sort((a, b) => b.mtime - a.mtime || a.relativePath.localeCompare(b.relativePath))
}
