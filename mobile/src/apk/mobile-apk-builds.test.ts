import { Buffer } from 'buffer'
import { describe, expect, it, vi } from 'vitest'
import { listMobileApkBuilds } from './mobile-apk-builds'
import type { RpcClient } from '../transport/rpc-client'

const zipEnd = Buffer.from('504b0506000000000000000000000000000000000000', 'hex')
function clientWithFiles(
  directories: Record<string, { name: string; isDirectory: boolean }[]>,
  sizes: Record<string, number>
) {
  const sendRequest = vi.fn(
    async (method: string, params: { relativePath: string; offset?: number; length?: number }) => {
      const path = params.relativePath
      if (method === 'files.readDir') {
        if (!(path in directories)) {
          return { ok: false, error: { message: 'ENOENT' } }
        }
        return { ok: true, result: directories[path] }
      }
      if (method === 'files.stat') {
        return {
          ok: true,
          result: {
            size: sizes[path],
            mtime: path.includes('release') ? 200 : 100,
            isDirectory: false
          }
        }
      }
      if (method === 'files.readChunk') {
        const bytes = path.includes('broken') ? Buffer.alloc(params.length!) : zipEnd
        return {
          ok: true,
          result: { contentBase64: bytes.toString('base64'), bytesRead: bytes.length, eof: true }
        }
      }
      throw new Error(`Unexpected ${method}`)
    }
  )
  return { client: { sendRequest } as unknown as RpcClient, sendRequest }
}

describe('mobile APK build discovery', () => {
  it('finds complete APKs in variant directories and sorts newest first', async () => {
    const root = 'mobile/android/app/build/outputs/apk'
    const debug = `${root}/debug`
    const release = `${root}/release`
    const { client } = clientWithFiles(
      {
        [root]: [
          { name: 'debug', isDirectory: true },
          { name: 'release', isDirectory: true }
        ],
        [debug]: [{ name: 'app-debug.apk', isDirectory: false }],
        [release]: [
          { name: 'app-release.apk', isDirectory: false },
          { name: 'broken.apk', isDirectory: false }
        ]
      },
      {
        [`${debug}/app-debug.apk`]: zipEnd.length,
        [`${release}/app-release.apk`]: zipEnd.length,
        [`${release}/broken.apk`]: zipEnd.length
      }
    )
    const builds = await listMobileApkBuilds(client, 'wt-1')
    expect(builds.map((build) => build.relativePath)).toEqual([
      `${release}/app-release.apk`,
      `${debug}/app-debug.apk`
    ])
  })

  it('accepts a workspace-relative custom output directory and rejects traversal', async () => {
    const { client, sendRequest } = clientWithFiles(
      {
        'dist/android': [{ name: 'custom.apk', isDirectory: false }]
      },
      { 'dist/android/custom.apk': zipEnd.length }
    )
    expect(await listMobileApkBuilds(client, 'wt-1', 'dist/android')).toHaveLength(1)
    expect(sendRequest).toHaveBeenCalledWith(
      'files.readDir',
      {
        worktree: 'id:wt-1',
        relativePath: 'dist/android'
      },
      expect.any(Object)
    )
    await expect(listMobileApkBuilds(client, 'wt-1', '../outside')).rejects.toThrow('relative')
  })
})
