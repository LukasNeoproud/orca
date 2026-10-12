import { createElement, useEffect } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { MobileLocalEmulatorTab } from './mobile-local-emulator-tab'
import { MobilePersistentEmulatorPanes } from './MobilePersistentEmulatorPanes'
import { hostType } from '../test-support/host-type-predicate'

const lifecycle = vi.hoisted(() => ({ mounted: [] as string[], unmounted: [] as string[] }))
vi.mock('react-native', () => ({
  View: 'View',
  StyleSheet: {
    absoluteFillObject: { position: 'absolute' },
    create: <T,>(styles: T) => styles
  }
}))
vi.mock('../emulator/MobileEmulatorPane', () => ({
  MobileEmulatorPane: ({ device, visible }: { device: { id: string }; visible: boolean }) => {
    useEffect(() => {
      lifecycle.mounted.push(device.id)
      return () => {
        lifecycle.unmounted.push(device.id)
      }
    }, [device.id])
    return createElement('Pane', { deviceId: device.id, visible })
  }
}))

const tabs: MobileLocalEmulatorTab[] = [
  {
    type: 'emulator',
    id: 'mobile-emulator:ios:ios-1',
    title: 'iPhone',
    scopeKey: 'host:worktree',
    device: { id: 'ios-1', name: 'iPhone', backend: 'ios', state: 'booted', isAvailable: true }
  },
  {
    type: 'emulator',
    id: 'mobile-emulator:android:android-1',
    title: 'Pixel',
    scopeKey: 'host:worktree',
    device: {
      id: 'android-1',
      name: 'Pixel',
      backend: 'android',
      state: 'booted',
      isAvailable: true
    }
  }
]

describe('persistent emulator panes', () => {
  it('keeps startup panes mounted while switching tabs and disposes a closed device', async () => {
    lifecycle.mounted.length = 0
    lifecycle.unmounted.length = 0
    const render = (openTabs: MobileLocalEmulatorTab[], activeTabId: string | null) =>
      createElement(MobilePersistentEmulatorPanes, {
        tabs: openTabs,
        activeTabId,
        client: null,
        appActive: true
      })
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(render(tabs, tabs[0]!.id))
    })
    expect(lifecycle.mounted).toEqual(['ios-1', 'android-1'])

    await act(async () => renderer.update(render(tabs, null)))
    expect(lifecycle.unmounted).toEqual([])
    expect(renderer.root.findAll(hostType('Pane')).map((pane) => pane.props.visible)).toEqual([
      false,
      false
    ])

    await act(async () => renderer.update(render(tabs, tabs[1]!.id)))
    expect(lifecycle.mounted).toEqual(['ios-1', 'android-1'])
    expect(renderer.root.findAll(hostType('Pane')).map((pane) => pane.props.visible)).toEqual([
      false,
      true
    ])

    await act(async () => renderer.update(render(tabs.slice(1), tabs[1]!.id)))
    expect(lifecycle.unmounted).toEqual(['ios-1'])
    await act(async () => renderer.unmount())
    expect(lifecycle.unmounted).toEqual(['ios-1', 'android-1'])
  })
})
