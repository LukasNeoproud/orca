import { describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { buildApkOnHost, probeHostApkBuild } from './mobile-apk-host-build'

vi.mock('expo-crypto', () => ({ randomUUID: () => 'run-0001' }))

type Reply = { ok: true; result: unknown } | { ok: false; error: { code: string; message: string } }

function clientWith(handler: (method: string, params: Record<string, unknown>) => Reply) {
  const sendRequest = vi.fn(async (method: string, params: Record<string, unknown>) =>
    handler(method, params)
  )
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the code under test calls only sendRequest.
  return { client: { sendRequest } as unknown as RpcClient, sendRequest }
}

const ok = (result: unknown): Reply => ({ ok: true, result })

describe('probeHostApkBuild', () => {
  it('reports an Android project with its saved variant', async () => {
    const { client } = clientWith(() => ok({ isAndroidProject: true, savedVariant: 'debug' }))
    expect(await probeHostApkBuild(client, 'wt-1')).toEqual({
      supported: true,
      savedVariant: 'debug'
    })
  })

  it('treats an older desktop as offering no build', async () => {
    const { client } = clientWith(() => ({
      ok: false,
      error: { code: 'method_not_found', message: 'Unknown method' }
    }))
    expect(await probeHostApkBuild(client, 'wt-1')).toEqual({ supported: false })
  })
})

describe('buildApkOnHost', () => {
  it('builds for the phone ABI and resolves with the APK to download', async () => {
    const statuses = [
      { phase: 'build' },
      { phase: 'done', apk: { relativePath: 'app/a.apk', size: 9 } }
    ]
    const { client, sendRequest } = clientWith((method) => {
      if (method === 'androidAppRun.buildStatus') {
        return ok(statuses.shift())
      }
      if (method === 'files.stat') {
        return ok({ size: 9, mtime: 77, isDirectory: false })
      }
      return ok({ runId: 'run-0001' })
    })

    const build = await buildApkOnHost(client, 'wt-1', 'debug', {
      abi: 'arm64-v8a',
      signal: new AbortController().signal,
      pollIntervalMs: 1
    })

    expect(build).toEqual({ relativePath: 'app/a.apk', size: 9, mtime: 77 })
    expect(sendRequest.mock.calls[0]).toEqual([
      'androidAppRun.buildApk',
      { worktree: 'id:wt-1', runId: 'run-0001', variant: 'debug', abi: 'arm64-v8a' },
      expect.anything()
    ])
  })

  it('keeps polling through a dropped connection', async () => {
    let polls = 0
    const { client } = clientWith((method) => {
      if (method === 'androidAppRun.buildStatus') {
        polls += 1
        if (polls === 1) {
          throw new Error('disconnected')
        }
        return ok({ phase: 'done', apk: { relativePath: 'app/a.apk', size: 9 } })
      }
      return ok({ size: 9, mtime: 1, isDirectory: false })
    })

    await expect(
      buildApkOnHost(client, 'wt-1', 'debug', {
        abi: null,
        signal: new AbortController().signal,
        pollIntervalMs: 1
      })
    ).resolves.toMatchObject({ relativePath: 'app/a.apk' })
  })

  it('surfaces a failed build and cancels on the host when aborted', async () => {
    const failing = clientWith((method) =>
      method === 'androidAppRun.buildStatus'
        ? ok({ phase: 'failed', error: 'exit code 1' })
        : ok({})
    )
    await expect(
      buildApkOnHost(failing.client, 'wt-1', 'debug', {
        abi: null,
        signal: new AbortController().signal,
        pollIntervalMs: 1
      })
    ).rejects.toThrow('exit code 1')

    const controller = new AbortController()
    const aborted = clientWith(() => ok({ phase: 'build' }))
    const running = buildApkOnHost(aborted.client, 'wt-1', 'debug', {
      abi: null,
      signal: controller.signal,
      pollIntervalMs: 50
    })
    controller.abort()
    await expect(running).rejects.toThrow('Build cancelled.')
    expect(aborted.sendRequest).toHaveBeenCalledWith('androidAppRun.cancel', { runId: 'run-0001' })
  })
})
