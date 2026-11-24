import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  nextAzureDevOpsWorkFactsDelay,
  startAzureDevOpsWorkFactsRefresh
} from './azure-devops-work-facts-schedule'

const MINUTE = 60_000

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function start(options: { online?: () => boolean; failed?: () => boolean } = {}) {
  const runRound = vi.fn(async () => ({ failed: options.failed?.() ?? false }))
  const stop = startAzureDevOpsWorkFactsRefresh({
    listRepos: () => [],
    isOnline: options.online ?? (() => true),
    runRound
  })
  return { runRound, stop }
}

describe('startAzureDevOpsWorkFactsRefresh', () => {
  it('runs a round shortly after start and then every fifteen minutes', async () => {
    const { runRound, stop } = start()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(runRound).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(14 * MINUTE)
    expect(runRound).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(runRound).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(60 * MINUTE)
    expect(runRound).toHaveBeenCalledTimes(2)
  })

  it('sends nothing while offline and resumes within a minute of the network returning', async () => {
    let online = false
    const { runRound, stop } = start({ online: () => online })
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(runRound).not.toHaveBeenCalled()
    online = true
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(runRound).toHaveBeenCalledTimes(1)
    stop()
  })

  it('retries a failed round after a minute and backs off to the interval', async () => {
    let failed = true
    const { runRound, stop } = start({ failed: () => failed })
    await vi.advanceTimersByTimeAsync(20_000)
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(runRound).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2 * MINUTE)
    expect(runRound).toHaveBeenCalledTimes(3)
    failed = false
    await vi.advanceTimersByTimeAsync(4 * MINUTE)
    expect(runRound).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(14 * MINUTE)
    expect(runRound).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(runRound).toHaveBeenCalledTimes(5)
    stop()
  })

  it('treats a round that throws as failed', async () => {
    const runRound = vi.fn(async () => {
      throw new Error('boom')
    })
    const stop = startAzureDevOpsWorkFactsRefresh({
      listRepos: () => [],
      isOnline: () => true,
      runRound
    })
    await vi.advanceTimersByTimeAsync(20_000 + MINUTE)
    expect(runRound).toHaveBeenCalledTimes(2)
    stop()
  })
})

describe('nextAzureDevOpsWorkFactsDelay', () => {
  it('doubles from one minute and never exceeds the refresh interval', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(nextAzureDevOpsWorkFactsDelay)).toEqual(
      [15, 1, 2, 4, 8, 15, 15].map((minutes) => minutes * MINUTE)
    )
  })
})
