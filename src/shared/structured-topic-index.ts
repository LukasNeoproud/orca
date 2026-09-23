export type StructuredTopicAnchor = { epoch: string; itemId: string; sequence: number }

export type StructuredTopicChapter = {
  id: string
  title: string
  start: StructuredTopicAnchor
  end: StructuredTopicAnchor
  titleSource: 'automatic' | 'manual'
  /** An explicit split/merge boundary; automatic reconciliation must never cross it. */
  boundaryAfterManual: boolean
}

export type StructuredTopicIndex = {
  sessionId: string
  revision: number
  automatic: boolean
  chapters: StructuredTopicChapter[]
}

export type StructuredTopicTurn = {
  start: StructuredTopicAnchor
  end: StructuredTopicAnchor
  prompt: string
  reply?: string
}

const STOP_WORDS = new Set([
  'about',
  'after',
  'agent',
  'and',
  'are',
  'can',
  'code',
  'for',
  'from',
  'help',
  'into',
  'its',
  'please',
  'that',
  'the',
  'this',
  'to',
  'use',
  'with',
  'you',
  'your'
])

export function emptyStructuredTopicIndex(sessionId: string): StructuredTopicIndex {
  return { sessionId, revision: 0, automatic: true, chapters: [] }
}

/** Bounded local topic signal. It is deliberately an honest label, never a completion claim. */
export function topicTerms(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu)
        ?.filter((word) => !STOP_WORDS.has(word)) ?? []
    )
  ].slice(0, 8)
}

export function automaticTopicTitle(prompt: string): string {
  const terms = topicTerms(prompt)
  if (terms.length === 0) {
    return 'Conversation'
  }
  return terms.slice(0, 4).join(' · ')
}

function overlap(left: readonly string[], right: readonly string[]): number {
  const rightSet = new Set(right)
  return left.filter((term) => rightSet.has(term)).length
}

/**
 * Incrementally assigns one completed turn. A return to an old subject starts a new chronological
 * chapter: only the tail is eligible, and manual boundaries are permanent.
 */
export function appendAutomaticTopicTurn(
  index: StructuredTopicIndex,
  turn: StructuredTopicTurn,
  createId: () => string = () => crypto.randomUUID()
): StructuredTopicIndex {
  if (!index.automatic || turn.start.epoch !== turn.end.epoch) {
    return index
  }
  const previous = index.chapters.at(-1)
  const nextTitle = automaticTopicTitle(turn.prompt)
  if (!previous || previous.boundaryAfterManual || previous.end.epoch !== turn.start.epoch) {
    return {
      ...index,
      revision: index.revision + 1,
      chapters: [...index.chapters, chapter(turn, nextTitle, createId)]
    }
  }
  const related = overlap(topicTerms(previous.title), topicTerms(turn.prompt)) > 0
  if (!related) {
    return {
      ...index,
      revision: index.revision + 1,
      chapters: [...index.chapters, chapter(turn, nextTitle, createId)]
    }
  }
  const updated: StructuredTopicChapter = {
    ...previous,
    end: turn.end,
    ...(previous.titleSource === 'automatic' ? { title: nextTitle } : {})
  }
  return {
    ...index,
    revision: index.revision + 1,
    chapters: [...index.chapters.slice(0, -1), updated]
  }
}

function chapter(
  turn: StructuredTopicTurn,
  title: string,
  createId: () => string
): StructuredTopicChapter {
  return {
    id: createId(),
    title,
    start: turn.start,
    end: turn.end,
    titleSource: 'automatic',
    boundaryAfterManual: false
  }
}

function revise(
  index: StructuredTopicIndex,
  chapters: StructuredTopicChapter[]
): StructuredTopicIndex {
  return { ...index, revision: index.revision + 1, chapters }
}

export function renameStructuredTopicChapter(
  index: StructuredTopicIndex,
  chapterId: string,
  title: string
): StructuredTopicIndex {
  const next = title.trim()
  if (!next) {
    return index
  }
  return revise(
    index,
    index.chapters.map((chapter) =>
      chapter.id === chapterId
        ? { ...chapter, title: next.slice(0, 120), titleSource: 'manual' }
        : chapter
    )
  )
}

export function splitStructuredTopicChapter(
  index: StructuredTopicIndex,
  chapterId: string,
  split: StructuredTopicAnchor,
  rightTitle = 'New topic',
  createId: () => string = () => crypto.randomUUID()
): StructuredTopicIndex {
  const position = index.chapters.findIndex((chapter) => chapter.id === chapterId)
  const chapter = index.chapters[position]
  if (
    !chapter ||
    split.epoch !== chapter.start.epoch ||
    split.sequence <= chapter.start.sequence ||
    split.sequence > chapter.end.sequence
  ) {
    return index
  }
  const left = { ...chapter, end: split, boundaryAfterManual: true }
  const right: StructuredTopicChapter = {
    ...chapter,
    id: createId(),
    title: rightTitle.trim().slice(0, 120) || 'New topic',
    start: split,
    titleSource: 'manual',
    boundaryAfterManual: chapter.boundaryAfterManual
  }
  return revise(index, [
    ...index.chapters.slice(0, position),
    left,
    right,
    ...index.chapters.slice(position + 1)
  ])
}

export function mergeStructuredTopicChapters(
  index: StructuredTopicIndex,
  leftId: string,
  rightId: string,
  title?: string
): StructuredTopicIndex {
  const leftPosition = index.chapters.findIndex((chapter) => chapter.id === leftId)
  if (leftPosition === -1 || index.chapters[leftPosition + 1]?.id !== rightId) {
    return index
  }
  const left = index.chapters[leftPosition]!
  const right = index.chapters[leftPosition + 1]!
  if (left.end.epoch !== right.start.epoch) {
    return index
  }
  const merged = {
    ...left,
    end: right.end,
    title: title?.trim().slice(0, 120) || left.title,
    titleSource: title?.trim() ? ('manual' as const) : left.titleSource,
    boundaryAfterManual: right.boundaryAfterManual
  }
  return revise(index, [
    ...index.chapters.slice(0, leftPosition),
    merged,
    ...index.chapters.slice(leftPosition + 2)
  ])
}
