import { describe, expect, it } from 'vitest'
import type { ClaudeModsSiteLayout } from './claude-mods-layout-measure'
import { ClaudeModsScrollSync } from './claude-mods-scroll-sync'

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function harness(answer: (fields: Record<string, unknown>) => unknown = () => null) {
  const requests: Record<string, unknown>[] = []
  const frames: (() => void)[] = []
  const window = { offset: 0, bodyRows: 5, contentRows: 40 }
  const scrolls: [number, boolean][] = []
  const releases: (() => void)[] = []
  let hold = false
  const sync = new ClaudeModsScrollSync({
    component: 'Pane',
    instanceId: 'notes',
    request: async (fields) => {
      requests.push(fields)
      if (hold) {
        await new Promise<void>((resolve) => releases.push(resolve))
      }
      return answer(fields)
    },
    read: (): ClaudeModsSiteLayout => ({ ...window, bodyColumns: 40, keyed: [] }),
    scrollTo: (offset, toEnd) => {
      scrolls.push([offset, toEnd])
      window.offset = toEnd
        ? Math.max(0, window.contentRows - window.bodyRows)
        : Math.min(offset, Math.max(0, window.contentRows - window.bodyRows))
      return window.offset
    },
    schedule: (run) => {
      frames.push(run)
      return () => frames.splice(frames.indexOf(run), 1)
    }
  })
  return {
    sync,
    requests,
    window,
    scrolls,
    frame: () => frames.shift()?.(),
    holdRequests: () => {
      hold = true
    },
    release: () => releases.shift()?.()
  }
}

describe('ClaudeModsScrollSync', () => {
  it('reports the rows moved since the last known position, once per frame', async () => {
    const { sync, requests, window, frame } = harness()
    window.offset = 3
    sync.moved(3, false, { column: 4, row: 1 })
    window.offset = 7
    sync.moved(7, false)
    expect(requests).toEqual([])
    frame()
    await flush()
    expect(requests).toEqual([
      {
        component: 'Pane',
        instance_id: 'notes',
        offset: 7,
        by: 7,
        body_rows: 5,
        content_rows: 40,
        pointer: { column: 4, row: 1 }
      }
    ])
  })

  it('sums moves that land while a request is in flight into one that follows', async () => {
    const { sync, requests, window, frame, holdRequests, release } = harness(() => ({
      moved: true,
      offset: 4
    }))
    holdRequests()
    window.offset = 2
    sync.moved(2, false)
    frame()
    window.offset = 3
    sync.moved(3, false)
    window.offset = 6
    sync.moved(6, false)
    frame()
    expect(requests).toHaveLength(1)
    release()
    await flush()
    frame()
    expect(requests.map((request) => request.by)).toEqual([2, 4])
  })

  it('moves the window to the offset the engine answers with', async () => {
    const { sync, window, scrolls, frame } = harness(() => ({ moved: false, offset: 1 }))
    window.offset = 9
    sync.moved(9, false)
    frame()
    await flush()
    expect(scrolls).toEqual([[1, false]])
    expect(window.offset).toBe(1)
  })

  it('reports a wheel against an edge though nothing moved', async () => {
    const { sync, requests, frame } = harness()
    sync.pushedAgainstEdge(-3, { column: 0, row: 0 })
    frame()
    await flush()
    expect(requests[0]).toMatchObject({ offset: 0, by: -3 })
  })

  it('follows the end through the two pushes of a plugin scrolling to end', () => {
    const { sync, scrolls, window } = harness()
    window.contentRows = 20
    sync.push(15, false)
    expect(sync.isFollowingEnd).toBe(false)
    sync.push(15, true)
    expect(sync.isFollowingEnd).toBe(true)
    expect(scrolls).toEqual([
      [15, false],
      [15, true]
    ])
    // The content grows: the next layout pins to the new last rows.
    window.contentRows = 30
    sync.afterLayout()
    expect(window.offset).toBe(25)
  })

  it('stops following when a push without the flag or the person moves the window', async () => {
    const { sync, window, frame } = harness(() => ({ moved: true, offset: 10 }))
    sync.push(0, true)
    window.offset = 10
    sync.moved(10, false)
    window.contentRows = 80
    window.offset = 4
    sync.moved(4, false)
    frame()
    await flush()
    expect(sync.isFollowingEnd).toBe(false)
    sync.push(0, true)
    sync.push(3, false)
    expect(sync.isFollowingEnd).toBe(false)
  })

  it('keeps following through a wheel against the end the engine says still follows', async () => {
    const { sync, requests, frame } = harness(() => ({ moved: true, offset: 35, follow_end: true }))
    sync.push(0, true)
    sync.pushedAgainstEdge(3)
    frame()
    await flush()
    expect(requests).toHaveLength(1)
    expect(sync.isFollowingEnd).toBe(true)
  })

  it('takes a follow_end answer to pin the window to the end', async () => {
    const { sync, window, frame } = harness(() => ({ moved: true, offset: 20, follow_end: true }))
    window.offset = 10
    sync.moved(10, false)
    frame()
    await flush()
    expect(sync.isFollowingEnd).toBe(true)
    expect(window.offset).toBe(35)
  })

  it('reaches a pushed offset once the content is tall enough', () => {
    const { sync, window } = harness()
    window.contentRows = 6
    sync.push(12, false)
    expect(window.offset).toBe(1)
    window.contentRows = 40
    sync.afterLayout()
    expect(window.offset).toBe(12)
  })

  it('drops moves still waiting for a frame when a plugin moves the window', async () => {
    const { sync, requests, window, frame } = harness()
    window.offset = 5
    sync.moved(5, false)
    sync.push(2, false)
    frame()
    await flush()
    expect(requests).toEqual([])
  })
})
