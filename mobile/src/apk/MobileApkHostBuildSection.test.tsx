import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { hostType } from '../test-support/host-type-predicate'
import { MobileApkHostBuildSection } from './MobileApkHostBuildSection'

const { probeHostApkBuild, listHostBuildVariants, buildApkOnHost } = vi.hoisted(() => ({
  probeHostApkBuild: vi.fn(),
  listHostBuildVariants: vi.fn(),
  buildApkOnHost: vi.fn()
}))

vi.mock('./mobile-apk-host-build', () => ({
  probeHostApkBuild,
  listHostBuildVariants,
  buildApkOnHost
}))
vi.mock('@orca/expo-apk-installer', () => ({ getPrimaryDeviceAbi: () => 'arm64-v8a' }))
vi.mock('lucide-react-native', () => ({
  Hammer: 'Hammer',
  Square: 'Square',
  SquareCheck: 'SquareCheck'
}))
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (value: unknown) => value }
}))

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: every call that would use the client is mocked above.
const client = {} as RpcClient
const built = { relativePath: 'app/build/outputs/apk/debug/app-debug.apk', size: 9, mtime: 1 }
let renderer: ReactTestRenderer | null = null

async function render(onBuilt = vi.fn()) {
  await act(async () => {
    renderer = create(
      createElement(MobileApkHostBuildSection, {
        visible: true,
        client,
        worktreeId: 'wt-1',
        busy: false,
        onBuilt
      })
    )
  })
  return onBuilt
}

const pressable = (label: string) =>
  renderer!.root
    .findAll(hostType('Pressable'))
    .find((node) => node.props.accessibilityLabel === label)

beforeEach(() => {
  probeHostApkBuild.mockReset().mockResolvedValue({ supported: true, savedVariant: 'debug' })
  listHostBuildVariants.mockReset().mockResolvedValue(['debug', 'release'])
  buildApkOnHost.mockReset().mockResolvedValue(built)
})

afterEach(async () => {
  await act(async () => renderer?.unmount())
  renderer = null
})

describe('MobileApkHostBuildSection', () => {
  it('stays hidden when the desktop cannot build this workspace', async () => {
    probeHostApkBuild.mockResolvedValue({ supported: false })
    await render()
    expect(renderer!.toJSON()).toBeNull()
    expect(listHostBuildVariants).not.toHaveBeenCalled()
  })

  it('builds the saved variant for this phone ABI by default and hands the APK over', async () => {
    const onBuilt = await render()
    await act(async () => pressable('Build and install')!.props.onPress())

    expect(buildApkOnHost).toHaveBeenCalledWith(
      client,
      'wt-1',
      'debug',
      expect.objectContaining({ abi: 'arm64-v8a' })
    )
    expect(onBuilt).toHaveBeenCalledWith(built)
  })

  it('builds every ABI once the phone-only option is switched off', async () => {
    await render()
    await act(async () => pressable('Build only for this phone')!.props.onPress())
    await act(async () => pressable('Build variant release')!.props.onPress())
    await act(async () => pressable('Build and install')!.props.onPress())

    expect(buildApkOnHost).toHaveBeenCalledWith(
      client,
      'wt-1',
      'release',
      expect.objectContaining({ abi: null })
    )
  })
})
