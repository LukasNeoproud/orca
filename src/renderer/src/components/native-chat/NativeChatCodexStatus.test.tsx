// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) =>
    values
      ? fallback.replace(/{{(\w+)}}/g, (_match, key: string) => String(values[key] ?? ''))
      : fallback
}))

import { formatTokens, NativeChatCodexStatus } from './NativeChatCodexStatus'

afterEach(() => cleanup())

describe('NativeChatCodexStatus', () => {
  it('opens context details on hover and pins them on click', () => {
    render(
      <NativeChatCodexStatus
        contextUsage={{
          usedTokens: 64_000,
          maxTokens: 128_000,
          autoCompactThresholdTokens: 96_000,
          thresholdSource: 'config'
        }}
        weeklyUsedPercent={59}
      />
    )

    const trigger = screen.getByRole('button', { name: 'Codex context usage' })
    fireEvent.mouseEnter(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('64K / 128K tokens')).toBeTruthy()
    expect(screen.getByText('32K tokens until compaction')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.queryByText(/Marked arc/)).toBeNull()

    fireEvent.click(trigger)
    fireEvent.mouseLeave(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens on keyboard focus without moving focus and closes with Escape', () => {
    render(<NativeChatCodexStatus contextUsage={{ usedTokens: 1_000, maxTokens: 2_000 }} />)

    const trigger = screen.getByRole('button', { name: 'Codex context usage' })
    trigger.focus()
    fireEvent.focus(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(trigger)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps unknown and stale context neutral with a stale detail label', () => {
    const { container } = render(
      <NativeChatCodexStatus
        contextUsage={{
          usedTokens: 8_000,
          maxTokens: 16_000,
          autoCompactThresholdTokens: 12_000,
          stale: true
        }}
      />
    )

    expect(container.querySelector('[data-context-threshold-ratio]')).toBeNull()
    expect(container.querySelector('[data-context-fill-ratio]')).toBeNull()

    const trigger = screen.getByRole('button', { name: 'Codex context usage' })
    fireEvent.click(trigger)
    expect(screen.getByText('Context usage may be stale')).toBeTruthy()
    expect(screen.queryByText('4K tokens until compaction')).toBeNull()
  })

  it('shows a configured compaction arc before the first usage update', () => {
    const { container } = render(
      <NativeChatCodexStatus
        contextUsage={{ maxTokens: 200_000, autoCompactThresholdTokens: 150_000 }}
      />
    )

    expect(container.querySelector('[data-context-fill-ratio]')).toBeNull()
    expect(
      container
        .querySelector('[data-context-threshold-ratio]')
        ?.getAttribute('data-context-threshold-ratio')
    ).toBe('0.75')
  })

  it('uses the compact arc ratio and clamps weekly remaining text', () => {
    const { container } = render(
      <NativeChatCodexStatus
        contextUsage={{
          usedTokens: 99_999,
          maxTokens: 200_000,
          autoCompactThresholdTokens: 150_000
        }}
        weeklyUsedPercent={125}
      />
    )

    expect(
      container.querySelector('[data-context-fill-ratio]')?.getAttribute('data-context-fill-ratio')
    ).toBe('0.499995')
    expect(container.querySelector('[data-context-fill-ratio]')?.getAttribute('stroke')).toBe(
      'currentColor'
    )
    expect(
      container
        .querySelector('[data-context-threshold-ratio]')
        ?.getAttribute('data-context-threshold-ratio')
    ).toBe('0.75')
    const arc = container.querySelector('[data-context-threshold-ratio]')
    expect(arc?.tagName).toBe('circle')
    expect(arc?.getAttribute('pathLength')).toBe('100')
    expect(arc?.getAttribute('stroke-dasharray')).toBe('25 75')
    expect(arc?.getAttribute('stroke-dashoffset')).toBe('-75')
    expect(arc?.getAttribute('stroke')).toBe('var(--destructive)')
    expect(container.querySelector('line')).toBeNull()
    expect(screen.getByText('weekly 0% left')).toBeTruthy()
  })

  it('keeps a colored compaction track with the same width beyond the threshold', () => {
    const { container } = render(
      <NativeChatCodexStatus
        contextUsage={{
          usedTokens: 180_000,
          maxTokens: 200_000,
          autoCompactThresholdTokens: 150_000
        }}
      />
    )
    const arc = container.querySelector('[data-context-threshold-ratio]')
    const fill = container.querySelector('[data-context-fill-ratio]')
    expect(arc?.getAttribute('stroke-width')).toBe('2')
    expect(fill?.getAttribute('stroke-width')).toBe('2')
    expect(fill?.getAttribute('data-context-fill-ratio')).toBe('0.9')
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Codex context usage' }))
    expect(screen.getByText('0K tokens until compaction')).toBeTruthy()
  })

  it.each([200_000, 250_000])('does not mark an empty arc for threshold %s', (threshold) => {
    const { container } = render(
      <NativeChatCodexStatus
        contextUsage={{
          usedTokens: 0,
          maxTokens: 200_000,
          autoCompactThresholdTokens: threshold
        }}
      />
    )
    expect(container.querySelector('[data-context-threshold-ratio]')).toBeNull()
    expect(container.querySelector('[data-context-fill-ratio]')).toBeNull()
  })

  it('formats every token count in K without trailing decimal zeroes', () => {
    expect(formatTokens(500)).toBe('0.5K')
    expect(formatTokens(1_000)).toBe('1K')
    expect(formatTokens(1_234_567)).toBe('1234.6K')
    expect(formatTokens(undefined)).toBe('—')
  })

  it('keeps hover detail open while the pointer moves into it', () => {
    vi.useFakeTimers()
    render(<NativeChatCodexStatus contextUsage={{ usedTokens: 1_000, maxTokens: 2_000 }} />)

    const trigger = screen.getByRole('button', { name: 'Codex context usage' })
    fireEvent.mouseEnter(trigger)
    fireEvent.mouseLeave(trigger)
    fireEvent.mouseEnter(screen.getByRole('dialog'))
    act(() => vi.advanceTimersByTime(100))

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    vi.useRealTimers()
  })

  it('does not let a pending hover close dismiss a newly pinned detail', () => {
    vi.useFakeTimers()
    render(<NativeChatCodexStatus contextUsage={{ usedTokens: 1_000, maxTokens: 2_000 }} />)

    const trigger = screen.getByRole('button', { name: 'Codex context usage' })
    fireEvent.mouseEnter(trigger)
    fireEvent.mouseLeave(trigger)
    fireEvent.click(trigger)
    act(() => vi.advanceTimersByTime(100))

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    vi.useRealTimers()
  })

  it('labels unavailable and prefix-scoped compaction limits without absolute claims', () => {
    const unavailable = render(<NativeChatCodexStatus contextUsage={{ usedTokens: 1_000 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Codex context usage' }))
    expect(screen.getByText('Compaction threshold unavailable')).toBeTruthy()
    unavailable.unmount()

    render(
      <NativeChatCodexStatus
        contextUsage={{
          usedTokens: 64_000,
          maxTokens: 128_000,
          autoCompactThresholdTokens: 96_000,
          thresholdSource: 'config',
          compactScope: 'body_after_prefix'
        }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Codex context usage' }))
    expect(screen.getByText('Compaction growth limit: 96K after prefix (configured)')).toBeTruthy()
    expect(screen.queryByText(/Compacts at/)).toBeNull()
  })
})
