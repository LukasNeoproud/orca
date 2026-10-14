import { describe, expect, it, vi } from 'vitest'
import { ClaudeModsClientFrame } from './claude-mods-client-frame'
import { ClaudeModsClientGuard, ClaudeModsClientWork } from './claude-mods-client-work'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A frame whose worker answers only when the test releases the oldest call. */
function heldFrame() {
  const posted: Record<string, unknown>[] = []
  let answer: (message: unknown) => void = () => {}
  const frame = new ClaudeModsClientFrame(
    {
      plugin: 'board',
      hash: 'h',
      modules: [],
      runtime: 'r',
      limits: { nodes: 10, depth: 4, chars: 1000, values: 10, dataDepth: 4 },
      files: []
    },
    ({ onMessage }) => {
      answer = onMessage
      return {
        postMessage: (message) => {
          if (isRecord(message)) {
            posted.push(message)
          }
        },
        terminate: () => {}
      }
    }
  )
  const release = async (): Promise<void> => {
    const next = posted.find((message) => message.answered !== true)
    if (next) {
      next.answered = true
      answer({ type: 'answer', seq: next.seq, ok: true, value: '"x"' })
    }
    for (let round = 0; round < 5; round += 1) {
      await Promise.resolve()
    }
  }
  return { frame, posted, release }
}

describe('ClaudeModsClientWork', () => {
  it('sends one call at a time and lets a waiting render, tick or move absorb the next', async () => {
    const { frame, posted, release } = heldFrame()
    await release()
    const rendered = vi.fn()
    const work = new ClaudeModsClientWork(frame, 'i', { failed: vi.fn(), rendered })
    work.render()
    work.render()
    work.tick(7)
    work.tick(7)
    work.act('pointer', { type: 'move', x: 1, y: 1 })
    work.act('pointer', { type: 'move', x: 2, y: 2 })
    work.act('key', { key: 'up' })
    for (let round = 0; round < 6; round += 1) {
      await release()
    }
    const calls = posted.slice(1).map((message) => [message.op, message.kind, message.payload])
    expect(calls).toEqual([
      ['render', undefined, undefined],
      ['render', undefined, undefined],
      ['act', 'tick', 7],
      ['act', 'pointer', { type: 'move', x: 2, y: 2 }],
      ['act', 'key', { key: 'up' }]
    ])
    expect(rendered).toHaveBeenCalledTimes(2)
  })
})

describe('ClaudeModsClientGuard', () => {
  it('calls a third unprompted render a loop', () => {
    const guard = new ClaudeModsClientGuard()
    expect([guard.unprompted(), guard.unprompted(), guard.unprompted()]).toEqual([
      true,
      true,
      false
    ])
    guard.prompted()
    expect(guard.unprompted()).toBe(true)
  })

  it('stops following the module size after 8 measurings in a row', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const guard = new ClaudeModsClientGuard()
    const results = Array.from({ length: 9 }, () => guard.measured())
    expect(results.filter(Boolean)).toHaveLength(8)
    expect(results.at(-1)).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
