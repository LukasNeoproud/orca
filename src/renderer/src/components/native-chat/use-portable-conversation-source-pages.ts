import { readPortableConversationPage } from '@/lib/portable-conversation-source-client'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  PortableConversationSource,
  PortableConversationSourceAnchor,
  PortableConversationSourceCursor,
  PortableConversationSourceIdentity,
  PortableConversationSourcePage
} from '../../../../shared/portable-conversation-source'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import {
  emptyPortableConversationSourcePageState,
  portableConversationSourcePageCacheKey,
  readPortableConversationSourcePageState,
  writePortableConversationSourcePageState,
  type PortableConversationSourcePageState
} from './portable-conversation-source-page-cache'

type MessageOrigin = {
  cursor: PortableConversationSourceCursor
  identity: PortableConversationSourceIdentity
}

type SourcePageState = PortableConversationSourcePageState

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : translate(
        'conversations.portableSource.readFailed',
        'The SSH source transcript could not be read.'
      )
}

function sameIdentity(
  left: PortableConversationSourceIdentity | null,
  right: PortableConversationSourceIdentity
): boolean {
  return (
    left !== null &&
    left.fingerprint === right.fingerprint &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs
  )
}

function appendPage(
  state: SourcePageState,
  page: PortableConversationSourcePage,
  replace: boolean
): SourcePageState {
  // A re-read with a new file identity invalidates every cached origin. Keeping
  // old rows would let an anchor appear valid after a transcript rewrite.
  const clear = replace || (state.identity !== null && !sameIdentity(state.identity, page.identity))
  const messages = clear ? [] : [...state.messages]
  const origins = clear ? new Map<string, MessageOrigin>() : new Map(state.origins)
  const completedAssistantMessageIds = clear
    ? new Set<string>()
    : new Set(state.completedAssistantMessageIds)
  for (const messageId of page.turnEvidence?.completedAssistantMessageIds ?? []) {
    completedAssistantMessageIds.add(messageId)
  }
  for (const message of page.transcriptMessages) {
    if (!origins.has(message.id)) {
      messages.push(message)
      origins.set(message.id, { cursor: page.cursor, identity: page.identity })
    }
  }
  return {
    ...state,
    messages,
    origins,
    nextCursor: page.nextCursor,
    identity: page.identity,
    verified: true,
    loading: false,
    error: null,
    completedAssistantMessageIds
  }
}

export function usePortableConversationSourcePages({
  target,
  source,
  initialAnchor
}: {
  target: RuntimeClientTarget
  source: PortableConversationSource
  initialAnchor?: PortableConversationSourceAnchor
}): {
  state: SourcePageState
  loadNext: () => void
  showBeginning: () => void
  showAnchor: () => void
  showExternalAnchor: (anchor: PortableConversationSourceAnchor) => void
  anchorFor: (
    message: NativeChatMessage,
    selectedText?: string
  ) => PortableConversationSourceAnchor | null
  selectionFor: (
    message: NativeChatMessage,
    selectedText?: string
  ) => PortableConversationSourceAnchor | null
} {
  const pageCacheKey = portableConversationSourcePageCacheKey({ target, source, initialAnchor })
  const [snapshot, setSnapshot] = useState(() => ({
    key: pageCacheKey,
    state:
      readPortableConversationSourcePageState(pageCacheKey) ??
      emptyPortableConversationSourcePageState(initialAnchor)
  }))
  const state =
    snapshot.key === pageCacheKey
      ? snapshot.state
      : emptyPortableConversationSourcePageState(initialAnchor)
  const generation = useRef(0)
  const stateRef = useRef(state)
  stateRef.current = state

  const updateState = useCallback(
    (updater: (current: SourcePageState) => SourcePageState): void => {
      setSnapshot((current) => {
        if (current.key !== pageCacheKey) {
          return current
        }
        const next = updater(current.state)
        writePortableConversationSourcePageState(pageCacheKey, next)
        return { key: pageCacheKey, state: next }
      })
    },
    [pageCacheKey]
  )

  const load = useCallback(
    (
      cursor: PortableConversationSourceCursor | undefined,
      replace: boolean,
      expectedMessageId?: string,
      activeAnchor: PortableConversationSourceAnchor | null = stateRef.current.activeAnchor
    ) => {
      const requestGeneration = ++generation.current
      updateState((current) => ({
        ...(replace
          ? emptyPortableConversationSourcePageState(activeAnchor ?? undefined)
          : current),
        activeAnchor,
        loading: true,
        error: null
      }))
      void readPortableConversationPage(target, source, cursor).then(
        (page) => {
          if (generation.current !== requestGeneration) {
            return
          }
          if (
            expectedMessageId &&
            !page.transcriptMessages.some((message) => message.id === expectedMessageId)
          ) {
            updateState((current) => ({
              ...current,
              loading: false,
              error: translate(
                'conversations.portableSource.anchorUnavailable',
                'The selected response is no longer available at its verified source anchor.'
              )
            }))
            return
          }
          updateState((current) => appendPage(current, page, replace))
        },
        (error: unknown) => {
          if (generation.current === requestGeneration) {
            updateState((current) => ({ ...current, loading: false, error: errorMessage(error) }))
          }
        }
      )
    },
    [source, target, updateState]
  )

  useEffect(() => {
    generation.current += 1
    const cached = readPortableConversationSourcePageState(pageCacheKey)
    const hydrated = cached ?? emptyPortableConversationSourcePageState(initialAnchor)
    setSnapshot({ key: pageCacheKey, state: hydrated })
    // Re-read the first visible source page before cached rows can produce a
    // reusable anchor. This also removes them if the source file rewound.
    const anchor = hydrated.activeAnchor ?? initialAnchor ?? null
    load(anchor?.cursor, false, anchor?.messageId, anchor)
  }, [initialAnchor, load, pageCacheKey])

  const loadNext = useCallback(() => {
    if (!stateRef.current.loading && stateRef.current.nextCursor) {
      load(stateRef.current.nextCursor, false)
    }
  }, [load])
  const showBeginning = useCallback(() => load(undefined, true, undefined, null), [load])
  const showAnchor = useCallback(
    () => initialAnchor && load(initialAnchor.cursor, true, initialAnchor.messageId, initialAnchor),
    [initialAnchor, load]
  )
  const showExternalAnchor = useCallback(
    (anchor: PortableConversationSourceAnchor) =>
      load(anchor.cursor, true, anchor.messageId, anchor),
    [load]
  )
  const anchorFor = useCallback(
    (
      message: NativeChatMessage,
      selectedText?: string
    ): PortableConversationSourceAnchor | null => {
      if (!stateRef.current.verified) {
        return null
      }
      const origin = stateRef.current.origins.get(message.id)
      return origin
        ? {
            messageId: message.id,
            cursor: origin.cursor,
            identity: origin.identity,
            ...(selectedText ? { selectedText } : {})
          }
        : null
    },
    []
  )
  const selectionFor = useCallback(
    (
      message: NativeChatMessage,
      selectedText?: string
    ): PortableConversationSourceAnchor | null => {
      const anchor = anchorFor(message, selectedText)
      if (anchor) {
        updateState((current) => ({ ...current, activeAnchor: anchor }))
      }
      return anchor
    },
    [anchorFor, updateState]
  )
  return { state, loadNext, showBeginning, showAnchor, showExternalAnchor, anchorFor, selectionFor }
}
