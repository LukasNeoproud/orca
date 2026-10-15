import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeModsAsk } from '../../shared/claude-mods-prompt-answers'
import { ClaudeModsAskRouter } from './claude-mods-surface-asks'

const READ = {
  requestId: 'r1',
  subtype: 'ui_prompt_read',
  request: { subtype: 'ui_prompt_read' }
} as const
const FILL = {
  requestId: 'r2',
  subtype: 'ui_prompt_fill',
  request: { subtype: 'ui_prompt_fill', text: 'hi', mode: 'append' }
} as const

afterEach(() => {
  vi.useRealTimers()
})

describe('ClaudeModsAskRouter', () => {
  it('asks the composer that subscribed last and settles on its checked answer', async () => {
    const router = new ClaudeModsAskRouter(() => {})
    const first: ClaudeModsAsk[] = []
    const last: ClaudeModsAsk[] = []
    router.subscribe((ask) => first.push(ask))
    router.subscribe((ask) => last.push(ask))
    const answer = router.route(FILL, new AbortController().signal)
    expect(first).toEqual([])
    expect(last).toEqual([
      { id: expect.any(String), subtype: 'ui_prompt_fill', text: 'hi', mode: 'append' }
    ])
    expect(router.answer(last[0]!.id, { filled: true, stray: 1 })).toBe(true)
    await expect(answer).resolves.toEqual({ filled: true })
    // Each ask is answered at most once.
    expect(router.answer(last[0]!.id, { filled: false })).toBe(false)
  })

  it('answers the default at once with nobody listening', async () => {
    const router = new ClaudeModsAskRouter(() => {})
    await expect(router.route(READ, new AbortController().signal)).resolves.toEqual({
      text: '',
      cursor: 0
    })
  })

  it('answers the default once the deadline passes and drops the late answer', async () => {
    vi.useFakeTimers()
    const router = new ClaudeModsAskRouter(() => {}, 4_000)
    const asks: ClaudeModsAsk[] = []
    router.subscribe((ask) => asks.push(ask))
    const answer = router.route(FILL, new AbortController().signal)
    vi.advanceTimersByTime(4_000)
    await expect(answer).resolves.toEqual({ filled: false })
    expect(router.answer(asks[0]!.id, { filled: true })).toBe(false)
  })

  it('answers the default when the CLI cancels the ask or the composer leaves', async () => {
    const router = new ClaudeModsAskRouter(() => {})
    const unsubscribe = router.subscribe(() => {})
    const cancel = new AbortController()
    const cancelled = router.route(READ, cancel.signal)
    cancel.abort()
    await expect(cancelled).resolves.toEqual({ text: '', cursor: 0 })

    const left = router.route(FILL, new AbortController().signal)
    unsubscribe()
    await expect(left).resolves.toEqual({ filled: false })
  })

  it('reports only the first composer coming and the last one going', () => {
    const change = vi.fn()
    const router = new ClaudeModsAskRouter(change)
    const a = router.subscribe(() => {})
    const b = router.subscribe(() => {})
    expect(change).toHaveBeenCalledTimes(1)
    a()
    a()
    expect(change).toHaveBeenCalledTimes(1)
    b()
    expect(change).toHaveBeenCalledTimes(2)
    expect(router.listening).toBe(false)
  })
})
