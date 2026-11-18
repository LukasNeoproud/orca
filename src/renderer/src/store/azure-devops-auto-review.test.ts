import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as AutoReviewModule from './azure-devops-auto-review'

type AutoReviewStore = typeof AutoReviewModule.useAzureDevOpsAutoReview

/** Loads the store the way an app start does: fresh module state over the same storage. */
async function startApp(): Promise<AutoReviewStore> {
  vi.resetModules()
  return (await import('./azure-devops-auto-review')).useAzureDevOpsAutoReview
}

describe('review request marks', () => {
  beforeEach(() => {
    const stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value)
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps announced and unopened requests across a restart', async () => {
    const first = await startApp()
    first.getState().markUnopened(['a', 'b'])
    first.getState().markAnnounced(['a', 'b'])

    const second = await startApp()
    expect(second).not.toBe(first)
    expect([...second.getState().announcedKeys]).toEqual(['a', 'b'])
    expect([...second.getState().unopenedKeys]).toEqual(['a', 'b'])
  })

  it('clears the mark once the pull request is opened, and stays cleared after a restart', async () => {
    const first = await startApp()
    first.getState().markUnopened(['a', 'b'])
    first.getState().markOpened('a')
    expect([...first.getState().unopenedKeys]).toEqual(['b'])

    expect([...(await startApp()).getState().unopenedKeys]).toEqual(['b'])
  })

  it('treats a pull request opened before it was noticed as already announced', async () => {
    const store = await startApp()
    store.getState().markOpened('seen-in-the-list')

    expect(store.getState().announcedKeys.has('seen-in-the-list')).toBe(true)
  })

  it('drops the marks of pull requests that are no longer listed', async () => {
    const store = await startApp()
    store.getState().markHandled(['gone', 'kept'])
    store.getState().markUnopened(['gone', 'kept'])
    store.getState().markAnnounced(['gone', 'kept'])
    store.getState().retainHandled(new Set(['kept']))

    const state = (await startApp()).getState()
    expect([...(state.handledKeys ?? [])]).toEqual(['kept'])
    expect([...state.unopenedKeys]).toEqual(['kept'])
    expect([...state.announcedKeys]).toEqual(['kept'])
  })
})
