import type { JSONContent } from '@tiptap/react'
import type { AiResponseComment } from '../../../../shared/ai-response-comments'
// Module-level cache for the composer's in-progress draft text, keyed by the
// same stable pane scope as image attachments. The composer unmounts when the
// pane toggles back to the hosted terminal, so without this the typed-but-unsent
// draft would be lost on every TUI/GUI round-trip. Mirrors the attachment cache
// so both halves of an unsent message survive toggles and reconnects.

import { setBoundedScopeCacheEntry } from './native-chat-composer-scope-cache'

type NativeChatDraftCacheEntry = {
  text: string
  comments: readonly AiResponseComment[]
  document?: JSONContent
}

const draftCache = new Map<string, NativeChatDraftCacheEntry>()

const EMPTY_COMMENTS: readonly AiResponseComment[] = []
let responseCommentSequence = 0

function nextResponseCommentId(): string {
  const randomUuid = globalThis.crypto?.randomUUID
  if (typeof randomUuid === 'function') {
    return randomUuid.call(globalThis.crypto)
  }
  responseCommentSequence += 1
  return `response-comment-${Date.now()}-${responseCommentSequence}`
}

export function readNativeChatDraftCache(scopeKey: string): string {
  return draftCache.get(scopeKey)?.text ?? ''
}

export function writeNativeChatDraftCache(scopeKey: string, draft: string): void {
  // An empty draft carries no state worth retaining; drop the entry so a stale
  // scope key never resurrects cleared text.
  const cached = draftCache.get(scopeKey)
  if (draft === '' && (!cached || cached.comments.length === 0)) {
    draftCache.delete(scopeKey)
    return
  }
  // LRU-bounded so unsent drafts for permanently-removed panes can't accumulate.
  setBoundedScopeCacheEntry(draftCache, scopeKey, {
    text: draft,
    comments: cached?.comments ?? EMPTY_COMMENTS,
    document: cached?.text === draft ? cached.document : undefined
  })
}

export function readNativeChatResponseComments(scopeKey: string): readonly AiResponseComment[] {
  return draftCache.get(scopeKey)?.comments ?? EMPTY_COMMENTS
}

export function writeNativeChatResponseComments(
  scopeKey: string,
  comments: readonly AiResponseComment[]
): void {
  const cached = draftCache.get(scopeKey)
  if (comments.length === 0 && (!cached || cached.text === '')) {
    draftCache.delete(scopeKey)
    return
  }
  setBoundedScopeCacheEntry(draftCache, scopeKey, {
    text: cached?.text ?? '',
    comments,
    document: cached?.document
  })
}

export function appendNativeChatResponseComment(
  scopeKey: string,
  quote: string,
  comment: string
): AiResponseComment {
  const entry = { id: nextResponseCommentId(), quote, comment: comment.trim() }
  writeNativeChatResponseComments(scopeKey, [...readNativeChatResponseComments(scopeKey), entry])
  return entry
}

export function clearNativeChatDraftCacheForTests(): void {
  draftCache.clear()
}

export function readNativeChatDraftDocument(
  scopeKey: string,
  text: string
): JSONContent | undefined {
  const cached = draftCache.get(scopeKey)
  return cached?.text === text ? cached.document : undefined
}

export function writeNativeChatDraftDocument(
  scopeKey: string,
  text: string,
  document: JSONContent
): void {
  if (!text) {
    const comments = draftCache.get(scopeKey)?.comments ?? EMPTY_COMMENTS
    if (comments.length === 0) {
      draftCache.delete(scopeKey)
    } else {
      setBoundedScopeCacheEntry(draftCache, scopeKey, { text: '', comments })
    }
    return
  }
  setBoundedScopeCacheEntry(draftCache, scopeKey, {
    text,
    comments: draftCache.get(scopeKey)?.comments ?? EMPTY_COMMENTS,
    document
  })
}
