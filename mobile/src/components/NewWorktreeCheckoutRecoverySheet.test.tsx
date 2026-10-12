import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { NewWorktreeCheckoutRecoverySheet } from './NewWorktreeCheckoutRecoverySheet'
import { hostType } from '../test-support/host-type-predicate'

const clipboard = vi.hoisted(() => ({ setStringAsync: vi.fn(async () => {}) }))

vi.mock('expo-clipboard', () => clipboard)
vi.mock('./BottomDrawer', () => ({
  BottomDrawer: ({ children }: { children: unknown }) => children
}))
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (styles: unknown) => styles }
}))
vi.mock('lucide-react-native', () => ({ AlertTriangle: 'AlertTriangle', Copy: 'Copy' }))

describe('NewWorktreeCheckoutRecoverySheet', () => {
  it('shows the checkout error, preserves the note, and opens without starting an agent', async () => {
    const onOpen = vi.fn()
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        createElement(NewWorktreeCheckoutRecoverySheet, {
          warning: {
            kind: 'post-checkout-hook-failed',
            path: '/repo/worktree',
            message: 'Hook exited 1'
          },
          prompt: 'https://example.com/issues/7',
          note: 'Original request',
          onOpen
        })
      )
    })
    const output = JSON.stringify(renderer.toJSON())
    expect(output).toContain('Automatic setup and agent startup were paused')
    expect(output).toContain('Hook exited 1')
    expect(output).toContain('Original request')
    expect(output).toContain('https://example.com/issues/7')
    const buttons = renderer.root.findAll(hostType('Pressable'))
    await act(async () => buttons[0]?.props.onPress())
    expect(clipboard.setStringAsync).toHaveBeenCalledWith('https://example.com/issues/7')
    await act(async () => buttons[1]?.props.onPress())
    expect(clipboard.setStringAsync).toHaveBeenCalledWith('Original request')
    await act(async () => buttons[2]?.props.onPress())
    expect(onOpen).toHaveBeenCalledOnce()
    await act(async () => renderer.unmount())
  })
})
