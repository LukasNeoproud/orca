import { describe, expect, it, vi } from 'vitest'
import {
  appendAutomaticTopicTurn,
  emptyStructuredTopicIndex,
  mergeStructuredTopicChapters,
  renameStructuredTopicChapter,
  splitStructuredTopicChapter
} from './structured-topic-index'

const turn = (sequence: number, prompt: string) => ({
  start: { epoch: 'epoch', itemId: `u-${sequence}`, sequence },
  end: { epoch: 'epoch', itemId: `a-${sequence}`, sequence: sequence + 1 },
  prompt
})

describe('structured topic index', () => {
  it('extends adjacent refinements but starts a new chronological chapter on a new objective', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'chapter' })
    let index = appendAutomaticTopicTurn(
      emptyStructuredTopicIndex('s'),
      turn(1, 'Fix the login timeout')
    )
    index = appendAutomaticTopicTurn(index, turn(3, 'How should the login retry work?'))
    index = appendAutomaticTopicTurn(index, turn(5, 'Plan the database migration'))
    expect(index.chapters).toHaveLength(2)
    expect(index.chapters[0]?.start).toEqual({ epoch: 'epoch', itemId: 'u-1', sequence: 1 })
    expect(index.chapters[0]?.end.itemId).toBe('a-3')
  })

  it('keeps manual title and split boundary through automatic updates and merge', () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValueOnce('a').mockReturnValueOnce('b')
    })
    let index = appendAutomaticTopicTurn(
      emptyStructuredTopicIndex('s'),
      turn(1, 'Fix login timeout')
    )
    index = appendAutomaticTopicTurn(index, turn(3, 'Improve login retry'))
    index = renameStructuredTopicChapter(index, 'a', 'Authentication recovery')
    index = splitStructuredTopicChapter(
      index,
      'a',
      { epoch: 'epoch', itemId: 'u-3', sequence: 3 },
      'Retry design'
    )
    index = appendAutomaticTopicTurn(index, turn(5, 'Improve retry design'))
    expect(index.chapters).toHaveLength(2)
    expect(index.chapters[0]?.title).toBe('Authentication recovery')
    expect(index.chapters[1]?.end.itemId).toBe('a-5')
    index = mergeStructuredTopicChapters(index, 'a', 'b', 'Auth flow')
    expect(index.chapters).toHaveLength(1)
    expect(index.chapters[0]?.title).toBe('Auth flow')
  })

  it('accepts a supplied chapter ID generator when global crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined)
    let index = appendAutomaticTopicTurn(
      emptyStructuredTopicIndex('s'),
      turn(1, 'Review launch flow'),
      () => 'first'
    )
    index = appendAutomaticTopicTurn(index, turn(3, 'Review launch retry'), () => 'unused')
    index = splitStructuredTopicChapter(
      index,
      'first',
      { epoch: 'epoch', itemId: 'u-3', sequence: 3 },
      'Follow-up',
      () => 'split'
    )
    index = appendAutomaticTopicTurn(index, turn(5, 'Plan next step'), () => 'second')
    expect(index.chapters.map((chapter) => chapter.id)).toEqual(['first', 'split', 'second'])
  })
})
