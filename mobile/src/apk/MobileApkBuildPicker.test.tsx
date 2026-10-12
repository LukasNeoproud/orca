import { createElement } from 'react'
import { AppState } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { MobileApkBuildPicker } from './MobileApkBuildPicker'
import { hostType } from '../test-support/host-type-predicate'

const { listMobileApkBuilds, installMobileApkBuild } = vi.hoisted(() => ({
  listMobileApkBuilds: vi.fn(),
  installMobileApkBuild: vi.fn()
}))

vi.mock('./mobile-apk-builds', () => ({ listMobileApkBuilds }))
vi.mock('./mobile-apk-transfer', () => ({ installMobileApkBuild }))
vi.mock('../components/BottomDrawer', () => ({ BottomDrawer: 'BottomDrawer' }))
vi.mock('lucide-react-native', () => ({ FileDown: 'FileDown', RefreshCw: 'RefreshCw' }))
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  AppState: {
    currentState: 'active',
    addEventListener: vi.fn(() => ({ remove: vi.fn() }))
  },
  Pressable: 'Pressable',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 }
}))

const client = {} as RpcClient
const build = { relativePath: 'app/build/outputs/apk/debug/app-debug.apk', size: 1024, mtime: 3 }
let renderer: ReactTestRenderer | null = null

function button(label: string) {
  return renderer!.root
    .findAll(hostType('Pressable'))
    .find(
      (node) =>
        node.props.accessibilityLabel === label || node.props.children?.props?.children === label
    )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  listMobileApkBuilds.mockReset().mockResolvedValue([])
  installMobileApkBuild.mockReset().mockResolvedValue(undefined)
})

afterEach(async () => {
  await act(async () => renderer?.unmount())
  renderer = null
  vi.useRealTimers()
})

describe('MobileApkBuildPicker', () => {
  it('discovers completed builds while open and installs only the selected build on demand', async () => {
    listMobileApkBuilds.mockResolvedValueOnce([]).mockResolvedValue([build])
    await act(async () => {
      renderer = create(
        createElement(MobileApkBuildPicker, {
          visible: true,
          client,
          worktreeId: 'worktree-1',
          onClose: vi.fn()
        })
      )
    })
    expect(listMobileApkBuilds).toHaveBeenCalledWith(client, 'worktree-1', undefined)
    expect(installMobileApkBuild).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(
      renderer!.root
        .findAll(hostType('Pressable'))
        .some((node) => node.props.accessibilityLabel === build.relativePath)
    ).toBe(true)
    expect(installMobileApkBuild).not.toHaveBeenCalled()
    await act(async () => {
      renderer!.root
        .findAll(hostType('Pressable'))
        .find((node) => node.props.accessibilityLabel === build.relativePath)!
        .props.onPress()
    })
    await act(async () => button('Install selected APK')!.props.onPress())
    expect(installMobileApkBuild).toHaveBeenCalledWith(
      client,
      'worktree-1',
      build,
      expect.any(Function),
      expect.any(AbortSignal)
    )
  })

  it('searches a workspace relative path and exposes a retry after listing errors', async () => {
    listMobileApkBuilds.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValue([])
    await act(async () => {
      renderer = create(
        createElement(MobileApkBuildPicker, {
          visible: true,
          client,
          worktreeId: 'folder-2',
          onClose: vi.fn()
        })
      )
    })
    expect(JSON.stringify(renderer!.toJSON())).toContain('Connection lost')
    await act(async () => button('Refresh APK builds')!.props.onPress())
    expect(listMobileApkBuilds).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(renderer!.toJSON())).not.toContain('Connection lost')
    await act(async () => {
      renderer!.root.find(hostType('TextInput')).props.onChangeText('custom/outputs')
    })
    await act(async () => renderer!.root.find(hostType('TextInput')).props.onSubmitEditing())
    expect(listMobileApkBuilds).toHaveBeenLastCalledWith(client, 'folder-2', 'custom/outputs')
  })

  it('clears selection when a build at the same path changes before installation', async () => {
    listMobileApkBuilds
      .mockResolvedValueOnce([build])
      .mockResolvedValue([{ ...build, size: build.size + 1, mtime: build.mtime + 1 }])
    await act(async () => {
      renderer = create(
        createElement(MobileApkBuildPicker, {
          visible: true,
          client,
          worktreeId: 'worktree-1',
          onClose: vi.fn()
        })
      )
    })
    await act(async () => {
      renderer!.root
        .findAll(hostType('Pressable'))
        .find((node) => node.props.accessibilityLabel === build.relativePath)!
        .props.onPress()
    })
    expect(button('Install selected APK')!.props.disabled).toBe(false)
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(button('Install selected APK')!.props.disabled).toBe(true)
    expect(installMobileApkBuild).not.toHaveBeenCalled()
  })

  it('pauses discovery when Android leaves the app and refreshes on return', async () => {
    await act(async () => {
      renderer = create(
        createElement(MobileApkBuildPicker, {
          visible: true,
          client,
          worktreeId: 'worktree-1',
          onClose: vi.fn()
        })
      )
    })
    const listener = vi.mocked(AppState.addEventListener).mock.calls.at(-1)![1]
    await act(async () => listener('background'))
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(listMobileApkBuilds).toHaveBeenCalledTimes(1)
    await act(async () => listener('active'))
    expect(listMobileApkBuilds).toHaveBeenCalledTimes(2)
  })

  it('aborts an in-progress transfer when dismissed', async () => {
    const onClose = vi.fn()
    listMobileApkBuilds.mockResolvedValue([build])
    installMobileApkBuild.mockImplementation(() => new Promise(() => {}))
    await act(async () => {
      renderer = create(
        createElement(MobileApkBuildPicker, {
          visible: true,
          client,
          worktreeId: 'worktree-1',
          onClose
        })
      )
    })
    await act(async () => {
      renderer!.root
        .findAll(hostType('Pressable'))
        .find((node) => node.props.accessibilityLabel === build.relativePath)!
        .props.onPress()
    })
    await act(async () => button('Install selected APK')!.props.onPress())
    const signal = installMobileApkBuild.mock.calls[0][4] as AbortSignal
    expect(signal.aborted).toBe(false)
    await act(async () => renderer!.root.find(hostType('BottomDrawer')).props.onClose())
    expect(signal.aborted).toBe(true)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
