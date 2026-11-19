import { describe, expect, it, vi } from 'vitest'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewIteration,
  AzureDevOpsReviewThread
} from '../../../shared/azure-devops-review-types'
import { mapAzureDevOpsReviewThread, type RawReviewThread } from './azure-devops-review-mappers'
import {
  azureDevOpsReviewThreadOrigin,
  trackAzureDevOpsReviewThreads,
  type AzureDevOpsReviewLineLoader
} from './azure-devops-review-thread-tracking'

// A pull request with four iterations; the target branch moved before the third.
const iterations: AzureDevOpsReviewIteration[] = [
  { id: 1, sourceCommit: 's1', targetCommit: 't1', baseCommit: 'b1' },
  { id: 2, sourceCommit: 's2', targetCommit: 't1', baseCommit: 'b1' },
  { id: 3, sourceCommit: 's3', targetCommit: 't2', baseCommit: 'b2' },
  { id: 4, sourceCommit: 's4', targetCommit: 't2', baseCommit: 'b2' }
]

const changes: AzureDevOpsReviewChange[] = [
  { path: 'src/cart.ts', originalPath: null, changeType: 'edit', changeTrackingId: 1 },
  { path: 'src/checkout/price.ts', originalPath: null, changeType: 'add', changeTrackingId: 2 },
  { path: 'src/header.ts', originalPath: null, changeType: 'edit', changeTrackingId: 3 }
]

const cartAtFirst = [
  'export function total(items) {',
  '  let sum = 0',
  '  for (const item of items) {',
  '    sum += item.price',
  '  }',
  '  return sum',
  '}'
]

// Iteration four: a guard was added on top, the loop body was rewritten, the return is untouched.
const cartAtFourth = [
  'export function total(items) {',
  '  if (!items) {',
  '    return 0',
  '  }',
  '  let sum = 0',
  '  for (const item of items) {',
  '    sum += item.price * item.quantity',
  '  }',
  '  return sum',
  '}'
]

const files: Record<string, readonly string[]> = {
  's1:src/cart.ts': cartAtFirst,
  's4:src/cart.ts': cartAtFourth,
  's1:src/header.ts': ['export const title = "Cart"', ''],
  's4:src/header.ts': ['export const title = "Cart"', ''],
  's1:src/price.ts': ['export const vat = 0.21', 'export const currency = "CZK"'],
  's4:src/checkout/price.ts': [
    '// prices',
    'export const vat = 0.21',
    'export const currency = "CZK"'
  ],
  'b1:src/cart.ts': ['export function total() {', '  return 0', '}'],
  'b2:src/cart.ts': ['// cart', 'export function total() {', '  return 0', '}']
}

const loadLines: AzureDevOpsReviewLineLoader = async (path, commit) =>
  files[`${commit}:${path}`] ?? null

function rawThread(
  id: number,
  filePath: string,
  line: number,
  options: {
    side?: 'left' | 'right'
    endLine?: number
    iteration?: number
    changeTrackingId?: number
    status?: string
  } = {}
): RawReviewThread {
  const side = options.side ?? 'right'
  const iteration = options.iteration ?? 1
  return {
    id,
    status: options.status ?? 'active',
    threadContext: {
      filePath: `/${filePath}`,
      [`${side}FileStart`]: { line, offset: 1 },
      [`${side}FileEnd`]: { line: options.endLine ?? line, offset: 20 }
    },
    pullRequestThreadContext: {
      changeTrackingId: options.changeTrackingId ?? 1,
      iterationContext: { firstComparingIteration: iteration, secondComparingIteration: iteration }
    },
    comments: [{ id: 1, content: 'Why not a reducer?', author: { displayName: 'Ada' } }]
  }
}

async function track(
  raws: RawReviewThread[],
  loader: AzureDevOpsReviewLineLoader = loadLines
): Promise<AzureDevOpsReviewThread[]> {
  return trackAzureDevOpsReviewThreads({
    threads: raws.flatMap((raw) => {
      const thread = mapAzureDevOpsReviewThread(raw)
      return thread ? [{ thread, origin: azureDevOpsReviewThreadOrigin(raw) }] : []
    }),
    iterations,
    changes,
    loadLines: loader
  })
}

describe('trackAzureDevOpsReviewThreads', () => {
  it('moves a first-iteration thread to where its line is in the fourth iteration', async () => {
    const [thread] = await track([rawThread(10, 'src/cart.ts', 6)])
    expect(thread).toMatchObject({
      filePath: 'src/cart.ts',
      anchor: { side: 'right', startLine: 9, endLine: 9 },
      originalAnchor: { side: 'right', startLine: 6, endLine: 6 },
      iterationId: 1
    })
    expect(thread).not.toHaveProperty('outdated')
  })

  it('marks a thread outdated when its line was rewritten and keeps it on the replacement', async () => {
    const [thread] = await track([rawThread(11, 'src/cart.ts', 4)])
    expect(thread).toMatchObject({
      anchor: { side: 'right', startLine: 7, endLine: 7 },
      originalAnchor: { side: 'right', startLine: 4, endLine: 4 },
      outdated: true
    })
  })

  it('leaves a thread alone when its file did not change since', async () => {
    const [thread] = await track([rawThread(12, 'src/header.ts', 1)])
    expect(thread).toEqual(mapAzureDevOpsReviewThread(rawThread(12, 'src/header.ts', 1)))
    expect(thread).not.toHaveProperty('outdated')
    expect(thread).not.toHaveProperty('originalAnchor')
  })

  it('marks a thread outdated without a line when its lines are gone', async () => {
    const loader: AzureDevOpsReviewLineLoader = async (path, commit) =>
      commit === 's4'
        ? cartAtFourth.filter((line) => !line.includes('return sum'))
        : loadLines(path, commit)
    const [thread] = await track([rawThread(13, 'src/cart.ts', 6)], loader)
    expect(thread).toMatchObject({
      filePath: 'src/cart.ts',
      anchor: null,
      originalAnchor: { side: 'right', startLine: 6, endLine: 6 },
      outdated: true
    })
  })

  it('marks a thread outdated when the file is gone or cannot be read', async () => {
    const [gone, failed] = await Promise.all([
      track([rawThread(14, 'src/removed.ts', 3, { changeTrackingId: 9 })]),
      track([rawThread(15, 'src/cart.ts', 6)], async () => {
        throw new Error('offline')
      })
    ])
    expect(gone[0]).toMatchObject({ filePath: 'src/removed.ts', anchor: null, outdated: true })
    expect(failed[0]).toMatchObject({ anchor: null, outdated: true })
  })

  it('follows a file renamed in a later iteration through its change tracking id', async () => {
    const [thread] = await track([rawThread(16, 'src/price.ts', 2, { changeTrackingId: 2 })])
    expect(thread).toMatchObject({
      filePath: 'src/checkout/price.ts',
      anchor: { side: 'right', startLine: 3, endLine: 3 }
    })
    expect(thread).not.toHaveProperty('outdated')
  })

  it('does not move a thread into another file unless the commented lines are there', async () => {
    // The id names the cart file now, which does not hold the commented line.
    const [reused] = await track([rawThread(17, 'src/price.ts', 2, { changeTrackingId: 1 })])
    expect(reused).toMatchObject({ filePath: 'src/price.ts', anchor: null, outdated: true })
    // The file left the change list but still exists: its own path wins over the id.
    const loader: AzureDevOpsReviewLineLoader = async (path, commit) =>
      path === 'src/legacy.ts' ? ['// legacy', 'export const vat = 0.21'] : loadLines(path, commit)
    const [kept] = await track([rawThread(18, 'src/legacy.ts', 2, { changeTrackingId: 2 })], loader)
    expect(kept).toMatchObject({
      filePath: 'src/legacy.ts',
      anchor: { side: 'right', startLine: 2, endLine: 2 }
    })
    expect(kept).not.toHaveProperty('outdated')
  })

  it('does not read files for threads written on the latest iteration or without a line', async () => {
    const loader = vi.fn(loadLines)
    const general: RawReviewThread = { id: 20, comments: [{ id: 1, content: 'Overall fine' }] }
    const fileLevel: RawReviewThread = {
      id: 21,
      threadContext: { filePath: '/src/cart.ts' },
      pullRequestThreadContext: { iterationContext: { secondComparingIteration: 1 } },
      comments: [{ id: 1, content: 'Split this file' }]
    }
    const noIteration: RawReviewThread = {
      id: 22,
      threadContext: { filePath: '/src/cart.ts', rightFileStart: { line: 2, offset: 1 } },
      comments: [{ id: 1, content: 'From a bot' }]
    }
    const tracked = await track(
      [rawThread(19, 'src/cart.ts', 9, { iteration: 4 }), general, fileLevel, noIteration],
      loader
    )
    expect(loader).not.toHaveBeenCalled()
    expect(tracked.map((thread) => thread.anchor?.startLine ?? null)).toEqual([9, null, null, 2])
    expect(tracked.some((thread) => thread.outdated)).toBe(false)
  })

  it('tracks an old-side thread only when the merge base moved', async () => {
    const loader = vi.fn(loadLines)
    const tracked = await track(
      [
        rawThread(30, 'src/cart.ts', 2, { side: 'left', iteration: 1 }),
        rawThread(31, 'src/cart.ts', 2, { side: 'left', iteration: 3 })
      ],
      loader
    )
    expect(tracked[0]).toMatchObject({
      anchor: { side: 'left', startLine: 3, endLine: 3 },
      originalAnchor: { side: 'left', startLine: 2, endLine: 2 }
    })
    expect(tracked[1]).toMatchObject({ anchor: { side: 'left', startLine: 2, endLine: 2 } })
    expect(tracked[1]).not.toHaveProperty('originalAnchor')
    expect(loader.mock.calls.map(([path, commit]) => `${commit}:${path}`).sort()).toEqual([
      'b1:src/cart.ts',
      'b2:src/cart.ts'
    ])
  })

  it('reads each file version once however many threads share it', async () => {
    const loader = vi.fn(loadLines)
    await track(
      [
        rawThread(40, 'src/cart.ts', 2),
        rawThread(41, 'src/cart.ts', 4),
        rawThread(42, 'src/cart.ts', 6)
      ],
      loader
    )
    expect(loader).toHaveBeenCalledTimes(2)
  })
})

describe('azureDevOpsReviewThreadOrigin', () => {
  it('reads the compared iterations and falls back to an iteration against the base', () => {
    expect(
      azureDevOpsReviewThreadOrigin({
        pullRequestThreadContext: {
          changeTrackingId: 7,
          iterationContext: { firstComparingIteration: 1, secondComparingIteration: 3 }
        }
      })
    ).toEqual({ firstIteration: 1, secondIteration: 3, changeTrackingId: 7 })
    expect(
      azureDevOpsReviewThreadOrigin({
        pullRequestThreadContext: { iterationContext: { secondComparingIteration: 2 } }
      })
    ).toEqual({ firstIteration: 2, secondIteration: 2, changeTrackingId: null })
    expect(azureDevOpsReviewThreadOrigin({})).toBeNull()
  })
})
