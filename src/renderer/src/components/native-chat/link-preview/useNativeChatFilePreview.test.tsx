// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'

const mocks = vi.hoisted(() => ({
  readRuntimeFilePreview: vi.fn(),
  statRuntimePath: vi.fn(),
  subscribeRuntimeFileChanges: vi.fn()
}))

vi.mock('@/runtime/runtime-file-read-client', () => ({
  readRuntimeFilePreview: (...args: unknown[]) => mocks.readRuntimeFilePreview(...args)
}))
vi.mock('@/runtime/runtime-file-metadata-client', () => ({
  statRuntimePath: (...args: unknown[]) => mocks.statRuntimePath(...args)
}))
vi.mock('@/runtime/runtime-file-watch-client', () => ({
  subscribeRuntimeFileChanges: (...args: unknown[]) => mocks.subscribeRuntimeFileChanges(...args)
}))

import {
  resetNativeChatFilePreviewCacheForTests,
  useNativeChatFilePreview
} from './useNativeChatFilePreview'

const CONTEXT: RuntimeFileOperationArgs = {
  target: { kind: 'local' },
  worktreeId: 'worktree-1',
  worktreePath: '/repo'
}
const FILE_PATH = '/repo/src/example.ts'

beforeEach(() => {
  resetNativeChatFilePreviewCacheForTests()
  vi.clearAllMocks()
  mocks.statRuntimePath.mockResolvedValue({ size: 128, isDirectory: false, mtime: 1 })
  mocks.readRuntimeFilePreview.mockResolvedValue({
    content: 'const example = true\n',
    isBinary: false
  })
  mocks.subscribeRuntimeFileChanges.mockResolvedValue(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useNativeChatFilePreview', () => {
  it('does not read without the owning runtime context', () => {
    const { result } = renderHook(() => useNativeChatFilePreview(FILE_PATH, null, true))

    expect(result.current.status).toBe('unavailable')
    expect(mocks.statRuntimePath).not.toHaveBeenCalled()
    expect(mocks.readRuntimeFilePreview).not.toHaveBeenCalled()
  })

  it('starts a fresh load when an initially disabled preview becomes enabled', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useNativeChatFilePreview(FILE_PATH, CONTEXT, enabled),
      { initialProps: { enabled: false } }
    )

    expect(result.current.status).toBe('unavailable')
    rerender({ enabled: true })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(mocks.statRuntimePath).toHaveBeenCalledTimes(1)
  })

  it('stats before loading a bounded text preview', async () => {
    const { result } = renderHook(() => useNativeChatFilePreview(FILE_PATH, CONTEXT, true))

    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(mocks.statRuntimePath).toHaveBeenCalledWith(CONTEXT, FILE_PATH)
    expect(mocks.readRuntimeFilePreview).toHaveBeenCalledWith(CONTEXT, FILE_PATH)
    expect(result.current).toMatchObject({
      status: 'ready',
      content: 'const example = true\n',
      encoding: 'utf8',
      changed: false
    })
  })

  it('does not read a file above its text or binary preview cap', async () => {
    mocks.statRuntimePath.mockResolvedValueOnce({
      size: 256 * 1024 + 1,
      isDirectory: false,
      mtime: 1
    })
    const text = renderHook(() => useNativeChatFilePreview(FILE_PATH, CONTEXT, true))

    await waitFor(() => expect(text.result.current.status).toBe('large'))
    expect(mocks.readRuntimeFilePreview).not.toHaveBeenCalled()
    text.unmount()

    mocks.statRuntimePath.mockResolvedValueOnce({
      size: 8 * 1024 * 1024 + 1,
      isDirectory: false,
      mtime: 1
    })
    const image = renderHook(() => useNativeChatFilePreview('/repo/image.png', CONTEXT, true))

    await waitFor(() => expect(image.result.current.status).toBe('large'))
    expect(mocks.readRuntimeFilePreview).not.toHaveBeenCalled()
  })

  it('returns image and PDF data as base64 previews', async () => {
    mocks.readRuntimeFilePreview.mockResolvedValue({
      content: 'aW1hZ2U=',
      isBinary: true,
      isImage: true,
      mimeType: 'image/png'
    })
    const { result } = renderHook(() => useNativeChatFilePreview('/repo/image.png', CONTEXT, true))

    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(result.current).toMatchObject({
      content: 'aW1hZ2U=',
      encoding: 'base64',
      mimeType: 'image/png'
    })
  })

  it('reloads on an exact watch event and reports a changed mtime', async () => {
    let onChanges:
      | ((payload: {
          worktreePath: string
          events: { kind: 'update'; absolutePath: string }[]
        }) => void)
      | undefined
    mocks.subscribeRuntimeFileChanges.mockImplementation(
      (_context: RuntimeFileOperationArgs, listener: typeof onChanges) => {
        onChanges = listener
        return Promise.resolve(() => {})
      }
    )
    mocks.statRuntimePath
      .mockResolvedValueOnce({ size: 128, isDirectory: false, mtime: 1 })
      .mockResolvedValueOnce({ size: 128, isDirectory: false, mtime: 2 })
    const { result } = renderHook(() => useNativeChatFilePreview(FILE_PATH, CONTEXT, true))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    await waitFor(() => expect(onChanges).toBeDefined())
    act(() => {
      onChanges?.({
        worktreePath: '/repo',
        events: [{ kind: 'update', absolutePath: FILE_PATH }]
      })
    })

    await waitFor(() => expect(result.current.changed).toBe(true))
    expect(mocks.readRuntimeFilePreview).toHaveBeenCalledTimes(2)
  })

  it('deduplicates simultaneous loads for the same owned file', async () => {
    let resolveStat:
      | ((value: { size: number; isDirectory: boolean; mtime: number }) => void)
      | undefined
    mocks.statRuntimePath.mockImplementation(
      () =>
        new Promise<{ size: number; isDirectory: boolean; mtime: number }>((resolve) => {
          resolveStat = resolve
        })
    )
    const first = renderHook(() => useNativeChatFilePreview(FILE_PATH, CONTEXT, true))
    const second = renderHook(() => useNativeChatFilePreview(FILE_PATH, CONTEXT, true))

    expect(mocks.statRuntimePath).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveStat?.({ size: 128, isDirectory: false, mtime: 1 })
    })
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    await waitFor(() => expect(second.result.current.status).toBe('ready'))
    expect(mocks.readRuntimeFilePreview).toHaveBeenCalledTimes(1)
  })

  it('reads current content when a preview reopens after unmounting', async () => {
    mocks.readRuntimeFilePreview
      .mockResolvedValueOnce({ content: 'before', isBinary: false })
      .mockResolvedValueOnce({ content: 'after', isBinary: false })
    const first = renderHook(() => useNativeChatFilePreview(FILE_PATH, CONTEXT, true))

    await waitFor(() => expect(first.result.current.content).toBe('before'))
    first.unmount()

    const reopened = renderHook(() => useNativeChatFilePreview(FILE_PATH, CONTEXT, true))
    await waitFor(() => expect(reopened.result.current.content).toBe('after'))

    expect(mocks.statRuntimePath).toHaveBeenCalledTimes(2)
    expect(mocks.readRuntimeFilePreview).toHaveBeenCalledTimes(2)
  })

  it('reports a transient unavailable runtime without treating it as a file error', async () => {
    mocks.statRuntimePath.mockRejectedValueOnce({
      code: 'runtime_unavailable',
      message: 'offline'
    })
    const { result } = renderHook(() => useNativeChatFilePreview(FILE_PATH, CONTEXT, true))

    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.error).toBeUndefined()
  })

  it('drops a prior owner response when the file owner changes', async () => {
    let resolveFirst:
      | ((value: { size: number; isDirectory: boolean; mtime: number }) => void)
      | undefined
    mocks.statRuntimePath
      .mockImplementationOnce(
        () =>
          new Promise<{ size: number; isDirectory: boolean; mtime: number }>((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValueOnce({ size: 128, isDirectory: false, mtime: 2 })
    mocks.readRuntimeFilePreview.mockResolvedValueOnce({ content: 'new owner', isBinary: false })
    const nextContext: RuntimeFileOperationArgs = {
      ...CONTEXT,
      target: { kind: 'environment', environmentId: 'runtime-2' }
    }
    const { result, rerender } = renderHook(
      ({ context }: { context: RuntimeFileOperationArgs }) =>
        useNativeChatFilePreview(FILE_PATH, context, true),
      { initialProps: { context: CONTEXT } }
    )

    rerender({ context: nextContext })
    await waitFor(() => expect(result.current.content).toBe('new owner'))
    await act(async () => {
      resolveFirst?.({ size: 128, isDirectory: false, mtime: 1 })
    })

    expect(result.current).toMatchObject({ content: 'new owner', changed: false })
    expect(mocks.statRuntimePath).toHaveBeenCalledWith(nextContext, FILE_PATH)
  })

  it('starts a fresh request when a reload arrives during an in-flight read', async () => {
    let resolveFirst:
      | ((value: { size: number; isDirectory: boolean; mtime: number }) => void)
      | undefined
    mocks.statRuntimePath
      .mockImplementationOnce(
        () =>
          new Promise<{ size: number; isDirectory: boolean; mtime: number }>((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValueOnce({ size: 128, isDirectory: false, mtime: 2 })
    mocks.readRuntimeFilePreview.mockResolvedValueOnce({ content: 'fresh', isBinary: false })
    const { result } = renderHook(() => useNativeChatFilePreview(FILE_PATH, CONTEXT, true))

    act(() => result.current.reload())
    await waitFor(() => expect(result.current.content).toBe('fresh'))
    await act(async () => {
      resolveFirst?.({ size: 128, isDirectory: false, mtime: 1 })
    })

    expect(mocks.statRuntimePath).toHaveBeenCalledTimes(2)
    expect(result.current.content).toBe('fresh')
  })

  it('drops a late read after its runtime owner becomes unavailable', async () => {
    let resolveStat:
      | ((value: { size: number; isDirectory: boolean; mtime: number }) => void)
      | undefined
    mocks.statRuntimePath.mockImplementation(
      () =>
        new Promise<{ size: number; isDirectory: boolean; mtime: number }>((resolve) => {
          resolveStat = resolve
        })
    )
    const { result, rerender } = renderHook(
      ({ context }: { context: RuntimeFileOperationArgs | null }) =>
        useNativeChatFilePreview(FILE_PATH, context, true),
      { initialProps: { context: CONTEXT } as { context: RuntimeFileOperationArgs | null } }
    )

    rerender({ context: null })
    await act(async () => {
      resolveStat?.({ size: 128, isDirectory: false, mtime: 1 })
    })

    await waitFor(() => expect(result.current.status).toBe('unavailable'))
  })
})
